function cookieValue(header = "", name = "cf_session") {
  const item = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

export function createIdentity({ auth, db, config }) {
  return async function identity(req, res, next) {
    req.user = null;
    const session = cookieValue(req.headers.cookie);
    if (!session || !auth || !db) return next();
    try {
      const decoded = await auth.verifySessionCookie(session, true);
      const { data: profile, error } = await db.from("profiles")
        .select("id,email,full_name,avatar_url,role")
        .eq("id", decoded.uid).maybeSingle();
      if (error) throw error;
      if (!profile) {
        res.clearCookie("cf_session", { httpOnly: true, sameSite: "strict", secure: config.NODE_ENV === "production", path: "/" });
        return next();
      }
      req.user = profile;
      next();
    } catch (error) {
      if (["auth/session-cookie-expired", "auth/session-cookie-revoked", "auth/invalid-session-cookie", "auth/argument-error", "auth/id-token-revoked"].includes(error.code)) {
        res.clearCookie("cf_session", { httpOnly: true, sameSite: "strict", secure: config.NODE_ENV === "production", path: "/" });
        return next();
      }
      next(error);
    }
  };
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Sign in with Google to continue." });
  next();
}

export function requireOrganizer(req, res, next) {
  if (req.user?.role !== "organizer") return res.status(403).json({ error: "Organizer access is required." });
  next();
}
