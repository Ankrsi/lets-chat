import admin from "firebase-admin";
// import serviceAccount from "./service.json";
const serviceAccount = JSON.parse(process.env.SERVICE_ACCOUNT_JSON || "{}");

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default admin;
