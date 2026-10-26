import { z } from "zod";

const optional = z.string().trim().min(1).optional();
const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SUPABASE_URL: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  FIREBASE_PROJECT_ID: optional,
  FIREBASE_CLIENT_EMAIL: optional,
  FIREBASE_PRIVATE_KEY: optional,
  FIREBASE_WEB_API_KEY: optional,
  FIREBASE_AUTH_DOMAIN: optional,
  FIREBASE_APP_ID: optional,
  TICKET_ENCRYPTION_KEY: optional,
});

export function readConfig(env = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid CampusFlow environment:\n- ${details.join("\n- ")}`);
  }
  const value = parsed.data;
  let supabaseUrl;
  if (value.SUPABASE_URL) {
    supabaseUrl = new URL(value.SUPABASE_URL);
    if (supabaseUrl.pathname === "/rest/v1" || supabaseUrl.pathname === "/rest/v1/") {
      supabaseUrl.pathname = "/";
    }
    if (supabaseUrl.pathname !== "/" || supabaseUrl.search || supabaseUrl.hash) {
      throw new Error("SUPABASE_URL must be the project URL root (remove any API path such as /rest/v1).");
    }
  }
  if (value.NODE_ENV === "production" && new URL(value.APP_URL).protocol !== "https:") {
    throw new Error("APP_URL must use HTTPS in production.");
  }
  const required = [
    "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "FIREBASE_WEB_API_KEY",
    "FIREBASE_AUTH_DOMAIN", "FIREBASE_APP_ID", "TICKET_ENCRYPTION_KEY",
  ];
  const missing = required.filter((name) => !value[name]);
  let ticketKey = null;
  if (value.TICKET_ENCRYPTION_KEY) {
    ticketKey = Buffer.from(value.TICKET_ENCRYPTION_KEY, "base64");
    if (ticketKey.length !== 32) {
      throw new Error("TICKET_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
    }
  }
  return {
    ...value,
    SUPABASE_URL: supabaseUrl?.origin ?? value.SUPABASE_URL,
    appOrigin: new URL(value.APP_URL).origin,
    firebasePrivateKey: value.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    ticketKey,
    missing,
    ready: missing.length === 0,
  };
}

export function assertConfigured(config) {
  if (!config.ready) {
    throw new Error(
      `CampusFlow configuration is incomplete. Set these environment variables: ${config.missing.join(", ")}. See .env.example and README.md.`,
    );
  }
}
