const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();
const authRoutes = require("./routes/auth");
const chatRoutes = require("./routes/chats");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Use clear namespaces
app.use("/api/auth", authRoutes);   // -> /api/auth/signup, /api/auth/login
app.use("/api/chats", chatRoutes);  // -> /api/chats/startChat, /api/chats/sendMessage, etc

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
