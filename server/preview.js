import { createApp } from "./application.js";
import { readConfig } from "./config.js";

const previewEnv = { ...process.env };
for (const key of [
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "FIREBASE_WEB_API_KEY",
  "FIREBASE_AUTH_DOMAIN", "FIREBASE_APP_ID", "TICKET_ENCRYPTION_KEY",
]) delete previewEnv[key];
const config = readConfig(previewEnv);
const app = createApp({ config });
const server = app.listen(config.PORT, () => {
  console.log(`CampusFlow preview (services disabled): ${config.APP_URL}`);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
