import * as admin from "firebase-admin";

const serviceAccountJson = process.env.SERVICE_ACCOUNT_JSON;

if (!serviceAccountJson) {
  throw new Error("SERVICE_ACCOUNT_JSON environment variable is not set.");
}

const serviceAccount = JSON.parse(serviceAccountJson);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const messaging = admin.messaging();

export default messaging;
