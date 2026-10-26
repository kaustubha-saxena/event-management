import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { query } from "./db.js";
export const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function checkPassword(password, stored) {
  const [salt, key] = stored.split(":");
  return timingSafeEqual(
    Buffer.from(key, "hex"),
    scryptSync(password, salt, 64),
  );
}
export function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
export async function identity(req, res, next) {
  try {
    const token = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("session="))
      ?.slice(8);
    if (token && /^[a-f0-9]{64}$/.test(token))
      req.user = (
        await query(
          "SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>UTC_TIMESTAMP()",
          [hashToken(token)],
        )
      )[0];
    next();
  } catch (e) {
    next(e);
  }
}
export function requireUser(req, res, next) {
  if (!req.user)
    return res.status(401).json({ error: "Please sign in to continue." });
  next();
}
export function requireOrganizer(req, res, next) {
  if (req.user?.role !== "organizer")
    return res.status(403).json({ error: "Organizer access is required." });
  next();
}
export async function createSession(user, res) {
  const token = randomBytes(32).toString("hex");
  await query(
    "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))",
    [hashToken(token), user.id],
  );
  res.cookie("session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 86400000,
    path: "/",
  });
}
export function text(value, min, max, label) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    fail(400, `${label} must contain ${min}–${max} characters.`);
  return value.trim();
}
export const categories = ["Technology", "Creative", "Career", "Community"];
export function eventValues(body) {
  const title = text(body.title, 3, 100, "Title"),
    description = text(body.description, 20, 2000, "Description"),
    venue = text(body.venue, 3, 120, "Venue");
  if (!categories.includes(body.category))
    fail(400, "Choose a valid category.");
  const date = new Date(body.starts_at);
  if (!Number.isFinite(date.getTime()) || date <= new Date())
    fail(400, "Choose a future event date and time.");
  const capacity = Number(body.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000)
    fail(400, "Capacity must be between 1 and 10,000.");
  return [
    title,
    description,
    body.category,
    venue,
    date.toISOString().slice(0, 19).replace("T", " "),
    capacity,
  ];
}
