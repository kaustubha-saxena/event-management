import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig } from "./config.js";
import { createDatabase } from "./db.js";
import { createFirebaseAuth } from "./services/firebase.js";
import { createIdentity } from "./middleware/authenticate.js";
import { createOriginGuard } from "./middleware/csrf.js";
import { authRoutes } from "./routes/auth.js";
import { eventRoutes } from "./routes/events.js";
import { registrationRoutes, savedRoutes } from "./routes/registrations.js";
import { ticketRoutes } from "./routes/tickets.js";
import { organizerRoutes } from "./routes/organizer.js";

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../public");

export function createApp(overrides = {}) {
  const config = overrides.config ?? readConfig();
  const db = overrides.db ?? createDatabase(config);
  const auth = overrides.auth ?? createFirebaseAuth(config);
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'", "https://www.gstatic.com", "https://apis.google.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'"], imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com", "https://www.googleapis.com", "https://apis.google.com", "https://cdn.jsdelivr.net"],
      frameSrc: ["https://*.firebaseapp.com", "https://accounts.google.com"],
      mediaSrc: ["'self'", "blob:"], workerSrc: ["'self'", "blob:"],
      objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
    } },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  }));
  app.use(express.json({ limit: "16kb", strict: true }));
  app.get("/api/health", (req, res) => {
    const ready = Boolean(config.ready && db && auth);
    res.status(ready ? 200 : 503).json({ status: ready ? "ok" : "not_configured", services: { supabase: Boolean(db), firebase: Boolean(auth) } });
  });
  app.get("/api/config", (req, res) => {
    res.set("Cache-Control", "no-store").json({
      firebase: config.FIREBASE_WEB_API_KEY && config.FIREBASE_AUTH_DOMAIN && config.FIREBASE_PROJECT_ID && config.FIREBASE_APP_ID
        ? { apiKey: config.FIREBASE_WEB_API_KEY, authDomain: config.FIREBASE_AUTH_DOMAIN, projectId: config.FIREBASE_PROJECT_ID, appId: config.FIREBASE_APP_ID }
        : null,
      ready: Boolean(config.ready && db && auth),
    });
  });
  app.use("/api", createOriginGuard(config));
  app.use("/api", createIdentity({ auth, db, config }));
  const context = { config, db, auth };
  app.use("/api/auth", authRoutes(context));
  app.use("/api/events", eventRoutes(context));
  app.use("/api/registrations", registrationRoutes(context));
  app.use("/api/saved", savedRoutes(context));
  app.use("/api/tickets", ticketRoutes(context));
  app.use("/api/organizer", organizerRoutes(context));
  app.use("/api", (req, res) => res.status(404).json({ error: "Endpoint not found." }));
  app.use(express.static(publicDir, { extensions: ["html"], maxAge: config.NODE_ENV === "production" ? "1h" : 0 }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error("CampusFlow request failed", { method: req.method, path: req.path, code: error.code ?? "internal_error" });
    res.status(status).json({ error: status >= 500 ? "The service could not complete the request. Try again shortly." : error.message });
  });
  return app;
}
