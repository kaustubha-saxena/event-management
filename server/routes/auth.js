import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { parse, sessionSchema } from "../validation.js";

const SESSION_MS = 5 * 24 * 60 * 60 * 1000;
const cookieOptions = (config) => ({
  httpOnly: true,
  secure: config.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: SESSION_MS,
  path: "/",
});

export function authRoutes({ auth, db, config }) {
  const router = Router();
  router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false }));
  router.get("/me", (req, res) => res.json({ user: req.user ?? null }));
  router.post("/session", async (req, res, next) => {
    try {
      if (!auth || !db) return res.status(503).json({ error: "Authentication services are not configured." });
      const { idToken } = parse(sessionSchema, req.body);
      const decoded = await auth.verifyIdToken(idToken, true);
      if (decoded.firebase?.sign_in_provider !== "google.com" || decoded.email_verified !== true) {
        return res.status(401).json({ error: "Use a verified Google account to sign in." });
      }
      const email = String(decoded.email || "").trim().toLowerCase();
      const fullName = String(decoded.name || email.split("@")[0] || "CampusFlow user").trim().slice(0, 80);
      const profileValues = {
        id: decoded.uid,
        email,
        full_name: fullName.length >= 2 ? fullName : "CampusFlow user",
        avatar_url: typeof decoded.picture === "string" ? decoded.picture.slice(0, 2048) : null,
      };
      let { data: profile, error } = await db.from("profiles")
        .select("id,email,full_name,avatar_url,role").eq("id", decoded.uid).maybeSingle();
      if (error) throw error;
      if (!profile) {
        ({ data: profile, error } = await db.from("profiles").insert(profileValues)
          .select("id,email,full_name,avatar_url,role").single());
        if (error?.code === "23505") {
          ({ data: profile, error } = await db.from("profiles")
            .select("id,email,full_name,avatar_url,role").eq("id", decoded.uid).single());
        }
        if (error) throw error;
      }
      const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_MS });
      res.cookie("cf_session", sessionCookie, cookieOptions(config));
      res.json({ user: profile });
    } catch (error) {
      if (String(error.code || "").startsWith("auth/") && !error.status) {
        error.status = 401;
        error.message = "Google sign-in token is invalid or expired.";
      }
      next(error);
    }
  });
  router.post("/logout", async (req, res, next) => {
    try {
      const session = (req.headers.cookie || "").split(";").map((part) => part.trim())
        .find((part) => part.startsWith("cf_session="))?.slice("cf_session=".length);
      if (session && auth) {
        try {
          const decoded = await auth.verifySessionCookie(decodeURIComponent(session), false);
          await auth.revokeRefreshTokens(decoded.uid);
        } catch { /* An expired cookie is still cleared locally. */ }
      }
      res.clearCookie("cf_session", cookieOptions(config));
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
  return router;
}
