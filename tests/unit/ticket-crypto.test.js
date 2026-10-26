import test from "node:test";
import assert from "node:assert/strict";
import { decryptToken, hashToken, issueToken } from "../../server/services/ticket-crypto.js";

const key = Buffer.from("ticket-key-test-0000000000000000").subarray(0, 32);

test("ticket tokens are unpredictable, hashed, and recoverable only with encryption key", () => {
  const first = issueToken(key);
  const second = issueToken(key);
  assert.notEqual(first.token, second.token);
  assert.equal(first.hash, hashToken(first.token));
  assert.equal(first.ciphertext.includes(first.token), false);
  assert.equal(decryptToken(first.ciphertext, key), first.token);
});

test("ticket token ciphertext rejects tampering and wrong keys", () => {
  const issued = issueToken(key);
  const [iv, tag, cipher] = issued.ciphertext.split(".");
  const altered = `${iv}.${tag}.${cipher.startsWith("A") ? "B" : "A"}${cipher.slice(1)}`;
  assert.throws(() => decryptToken(altered, key));
  assert.throws(() => decryptToken(issued.ciphertext, Buffer.alloc(32, 1)));
});
