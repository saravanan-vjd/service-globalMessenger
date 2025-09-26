const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db } = require("../utils/firebase");

const JWT_SECRET = "SUPER_SECRET_KEY";

// Signup
router.post("/signup", async (req, res) => {
  try {
    const { email, password, name, lang } = req.body;
    if (!email || !password || !name || !lang) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const emailLower = email.toLowerCase().trim();

    // Check if already exists
    const exists = await db.collection("users").doc(emailLower).get();
    if (exists.exists) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash password
    const hash = await bcrypt.hash(password, 10);

    // Create user
    await db.collection("users").doc(emailLower).set({
      email: emailLower,
      password: hash,
      name,
      lang,
      createdAt: new Date()
    });

    res.json({ success: true, userId: emailLower });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const snap = await db.collection("users").where("email", "==", email).get();
  if (snap.empty) return res.status(400).json({ error: "User not found" });

  const userDoc = snap.docs[0];
  const user = userDoc.data();
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: "Invalid password" });

  const token = jwt.sign({ userId: userDoc.id }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ success: true, token, userId: userDoc.id, name: user.name, lang: user.lang });
});

module.exports = router;
