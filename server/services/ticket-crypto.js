import { createHash, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function issueToken(key = process.env.TICKET_ENCRYPTION_KEY) {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), ciphertext: encryptToken(token, key) };
}

export function hashToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function encryptToken(token, key = process.env.TICKET_ENCRYPTION_KEY) {
  const material = Buffer.isBuffer(key) ? key : Buffer.from(key ?? "", "base64");
  if (material.length !== 32) throw new Error("Ticket encryption is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", material, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptToken(ciphertext, key = process.env.TICKET_ENCRYPTION_KEY) {
  const material = Buffer.isBuffer(key) ? key : Buffer.from(key ?? "", "base64");
  if (material.length !== 32) throw new Error("Ticket encryption is not configured.");
  const [ivText, tagText, encryptedText] = String(ciphertext).split(".");
  if (!ivText || !tagText || !encryptedText) throw new Error("Ticket data is invalid.");
  const decipher = createDecipheriv("aes-256-gcm", material, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final(),
  ]).toString("utf8");
}
