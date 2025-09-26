const express = require("express");
const router = express.Router();
const { db, admin } = require("../utils/firebase");
const { transliterateAndTranslate } = require("../utils/translator"); // OpenAI integration

// 🔹 Search users
router.get("/searchUser", async (req, res) => {
  try {
    const query = req.query.query?.toLowerCase();
    const currentUserId = req.query.userId;

    if (!query) return res.status(400).json({ success: false, error: "Query missing" });

    const usersSnapshot = await db.collection("users").get();

    const users = usersSnapshot.docs
      .map(doc => ({ userId: doc.id, ...doc.data() }))
      .filter(u =>
        u.userId !== currentUserId &&
        (
          u.name?.toLowerCase().includes(query) ||
          u.email?.toLowerCase().includes(query) ||
          u.phone?.includes(query)
        )
      );

    res.json({ success: true, users });
  } catch (err) {
    console.error("searchUser error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🔹 Start or get chat between two users
router.post("/startChat", async (req, res) => {
  const { userA, userB } = req.body;

  const chatSnapshot = await db.collection("chats")
    .where("members", "array-contains", userA)
    .get();

  let chat = chatSnapshot.docs.find(doc => doc.data().members.includes(userB));

  if (!chat) {
    const chatRef = await db.collection("chats").add({
      members: [userA, userB],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessage: "",
    });
    chat = { id: chatRef.id, members: [userA, userB] };
  } else {
    chat = { id: chat.id, members: chat.data().members };
  }

  res.json({ success: true, chat });
});

// 🔹 Send message with AI Transliterate + Translate
router.post("/sendMessage", async (req, res) => {
  try {
    const { chatId, senderId, text } = req.body;
    if (!chatId || !senderId || !text) return res.status(400).json({ error: "Missing fields" });

    const chatDocRef = db.collection("chats").doc(chatId);
    const chatDoc = await chatDocRef.get();
    if (!chatDoc.exists) return res.status(404).json({ error: "Chat not found" });

    const { members } = chatDoc.data();
    const receiverId = members.find(m => m !== senderId);

    // Get receiver's preferred language
    const receiverDoc = await db.collection("users").doc(receiverId).get();
    const receiverLang = receiverDoc.exists ? receiverDoc.data().lang || "en" : "en";

    // AI Transliterate + Translate
    const { commonText, translatedText } = await transliterateAndTranslate(text, receiverLang);

    const msg = {
      chatId,
      senderId,
      textOriginal: text,
      textCommon: commonText,
      textTranslated: translatedText,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Save message
    await db.collection("messages").add(msg);

    // 🔹 Update lastMessage for both users
    const lastMessage = {};
    members.forEach(memberId => {
      lastMessage[memberId] = memberId === senderId ? commonText : translatedText;
    });

    await chatDocRef.update({
      lastMessage,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: msg });
  } catch (err) {
    console.error("sendMessage AI error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🔹 Get messages for a chat
router.get("/messages/:chatId", async (req, res) => {
  const snap = await db.collection("messages")
    .where("chatId", "==", req.params.chatId)
    .orderBy("createdAt", "asc")
    .get();

  const messages = [];
  // snap.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));

  snap.forEach(doc => {
  const data = doc.data();
  messages.push({
    id: doc.id,
    textOriginal: data.textOriginal,
    textTranslated: data.textTranslated,
    senderId: data.senderId,
    createdAt: data.createdAt?.toDate?.() || new Date(), // convert Firestore timestamp to JS Date
  });
});

  res.json({ success: true, messages });
});

// 🔹 Get chats for a user with other user's name and user-specific lastMessage
router.get("/userChats/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;

    const snap = await db.collection("chats")
      .where("members", "array-contains", userId)
      .orderBy("updatedAt", "desc")
      .get();

    const chats = await Promise.all(snap.docs.map(async doc => {
      const data = doc.data();

      // find the other member
      const otherUserId = data.members.find(m => m !== userId);
      let otherUserName = "Unknown";

      if (otherUserId) {
        const userDoc = await db.collection("users").doc(otherUserId).get();
        if (userDoc.exists) otherUserName = userDoc.data().name || "Unknown";
      }

      return {
        id: doc.id,
        lastMessage: data.lastMessage?.[userId] || "", // ✅ user-specific lastMessage
        otherUserName,
        members: data.members,
        updatedAt: data.updatedAt,
      };
    }));

    res.json({ success: true, chats });
  } catch (err) {
    console.error("/userChats error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
