export function createOriginGuard(config) {
  return function originGuard(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (!req.is("application/json")) return res.status(415).json({ error: "Send JSON content." });
    let origin;
    try { origin = req.get("origin") ? new URL(req.get("origin")).origin : null; }
    catch { origin = null; }
    if (!origin || origin !== config.appOrigin) {
      return res.status(403).json({ error: "Cross-site request rejected." });
    }
    if (req.get("sec-fetch-site") === "cross-site" || req.get("x-csrf-token") !== "1") {
      return res.status(403).json({ error: "Request verification failed. Refresh the page and try again." });
    }
    next();
  };
}
