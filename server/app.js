import express from "express";
import helmet from "helmet";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "../public")));
app.get("/api/health", (req, res) => {
  res.status(503).json({ status: "not_configured", message: "CampusFlow data services are not connected yet." });
});
