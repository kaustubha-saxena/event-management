import test from "node:test";
import assert from "node:assert/strict";
import { assertConfigured, readConfig } from "../../server/config.js";

test("configuration identifies required provider settings without inventing values", () => {
  const config = readConfig({});
  assert.equal(config.ready, false);
  assert.ok(config.missing.includes("SUPABASE_SERVICE_ROLE_KEY"));
  assert.throws(() => assertConfigured(config), /configuration is incomplete/i);
});

test("ticket key must decode to exactly 32 bytes", () => {
  assert.throws(() => readConfig({ TICKET_ENCRYPTION_KEY: Buffer.alloc(8).toString("base64") }), /32-byte key/i);
});

test("Supabase URL accepts a project root or normalizes a copied REST endpoint", () => {
  assert.equal(readConfig({ SUPABASE_URL: "https://example.supabase.co/rest/v1/" }).SUPABASE_URL, "https://example.supabase.co");
  assert.throws(() => readConfig({ SUPABASE_URL: "https://example.supabase.co/other/path" }), /project URL root/i);
});
