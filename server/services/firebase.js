import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export function createFirebaseAuth(config) {
  if (!config.FIREBASE_PROJECT_ID || !config.FIREBASE_CLIENT_EMAIL || !config.firebasePrivateKey) return null;
  const app = getApps().find((item) => item.name === "campusflow") ?? initializeApp({
    credential: cert({
      projectId: config.FIREBASE_PROJECT_ID,
      clientEmail: config.FIREBASE_CLIENT_EMAIL,
      privateKey: config.firebasePrivateKey,
    }),
    projectId: config.FIREBASE_PROJECT_ID,
  }, "campusflow");
  return getAuth(app);
}
