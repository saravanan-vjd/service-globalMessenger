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

    const chatDoc = await db.collection("chats").doc(chatId).get();
    if (!chatDoc.exists) return res.status(404).json({ error: "Chat not found" });

    const { members } = chatDoc.data();
    const receiverId = members.find(m => m !== senderId);

    const receiverDoc = await db.collection("users").doc(receiverId).get();
    const receiverLang = receiverDoc.exists ? receiverDoc.data().lang || "en" : "en";

    // 🔹 AI Transliterate + Translate using ChatGPT
    const { commonText, translatedText } = await transliterateAndTranslate(text, receiverLang);

    const msg = {
      chatId,
      senderId,
      textOriginal: text,
      textCommon: commonText,
      textTranslated: translatedText,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("messages").add(msg);
    await db.collection("chats").doc(chatId).update({
      lastMessage: text,
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
  snap.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));

  res.json({ success: true, messages });
});

// 🔹 Get chats for a user
router.get("/userChats/:userId", async (req, res) => {
  const snap = await db.collection("chats")
    .where("members", "array-contains", req.params.userId)
    .orderBy("updatedAt", "desc")
    .get();

  const chats = [];
  snap.forEach(doc => chats.push({ id: doc.id, ...doc.data() }));

  res.json({ success: true, chats });
});

module.exports = router;