import { createFirebaseAuth } from "../server/services/firebase.js";
import { createDatabase } from "../server/db.js";
import { readConfig, assertConfigured } from "../server/config.js";

const config = readConfig();
assertConfigured(config);
const uid = process.argv[2]?.trim();
if (!uid || uid.length > 128 || !/^[A-Za-z0-9:_-]+$/.test(uid)) {
  console.error("Usage: node --env-file-if-exists=.env scripts/promote-organizer.js FIREBASE_UID");
  process.exit(2);
}

const auth = createFirebaseAuth(config);
const db = createDatabase(config);
try {
  const firebaseUser = await auth.getUser(uid);
  if (firebaseUser.disabled || !firebaseUser.emailVerified) {
    throw new Error("The Firebase account must be enabled and have a verified email address.");
  }
  const { data, error } = await db.from("profiles").update({ role: "organizer", updated_at: new Date().toISOString() })
    .eq("id", uid).select("id,role").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("The user must sign in to CampusFlow once before organizer provisioning.");
  console.log("Organizer role assigned to the verified Firebase account.");
} catch (error) {
  console.error(`Organizer provisioning failed: ${error.message}`);
  process.exitCode = 1;
}
