const admin = require("firebase-admin");
const { firebase } = require("../config/defaults.json");

admin.initializeApp({
  credential: admin.credential.cert(firebase),
});

const db = admin.firestore();

module.exports = { db, admin };
