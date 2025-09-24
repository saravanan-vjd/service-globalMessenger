const admin = require("firebase-admin");
// const { firebase } = require("../config/defaults.json");

const credentials = JSON.parse(process.env.CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(credentials.firebase),
});

const db = admin.firestore();

module.exports = { db, admin };
