import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../server/application.js";

function context(overrides = {}) {
  const config = {
    PORT: 3000, NODE_ENV: "test", APP_URL: "http://localhost:3000",
    appOrigin: "http://localhost:3000", ready: true, missing: [],
    FIREBASE_WEB_API_KEY: "public-test-key", FIREBASE_AUTH_DOMAIN: "example.test",
    FIREBASE_PROJECT_ID: "campusflow-test", FIREBASE_APP_ID: "web-test-id",
    ticketKey: Buffer.alloc(32, 7),
  };
  const db = {
    rpc: async (fn, args) => ({ data: fn === "search_events" ? [] : true, error: null }),
    from: () => { throw new Error("Unexpected table access in this test."); },
  };
  const auth = {
    verifySessionCookie: async () => { throw Object.assign(new Error("invalid"), { code: "auth/invalid-session-cookie" }); },
    verifyIdToken: async () => { throw Object.assign(new Error("invalid"), { code: "auth/invalid-id-token" }); },
    createSessionCookie: async () => "unused",
    revokeRefreshTokens: async () => {},
  };
  return { config: { ...config, ...overrides.config }, db: overrides.db ?? db, auth: overrides.auth ?? auth };
}

const mutating = (agent) => agent.set("Origin", "http://localhost:3000").set("X-CSRF-Token", "1");

test("API returns only public Firebase configuration and readiness", async () => {
  const app = createApp(context());
  const response = await request(app).get("/api/config").expect(200);
  assert.equal(response.body.firebase.projectId, "campusflow-test");
  assert.equal(response.body.ready, true);
  assert.equal(JSON.stringify(response.body).includes("service"), false);
});

test("Content Security Policy allows Firebase Google popup scripts", async () => {
  const response = await request(createApp(context())).get("/").expect(200);
  assert.match(response.headers["content-security-policy"], /script-src[^;]*https:\/\/apis\.google\.com/);
});

test("health reports configured services without exposing credentials", async () => {
  const response = await request(createApp(context())).get("/api/health").expect(200);
  assert.deepEqual(response.body, { status: "ok", services: { supabase: true, firebase: true } });
});

test("unauthenticated profile is null and protected writes require a session", async () => {
  const app = createApp(context());
  assert.deepEqual((await request(app).get("/api/auth/me").expect(200)).body, { user: null });
  await mutating(request(app).post("/api/events").send({})).expect(401);
});

test("cross-site and non-JSON writes are rejected before route handlers", async () => {
  const app = createApp(context());
  await request(app).post("/api/auth/logout").set("Origin", "https://attacker.example")
    .set("X-CSRF-Token", "1").send({}).expect(403);
  await request(app).post("/api/auth/logout").set("Origin", "http://localhost:3000")
    .set("Content-Type", "text/plain").send("x").expect(415);
});

test("invalid Firebase ID tokens are rejected", async () => {
  const response = await mutating(request(createApp(context())).post("/api/auth/session"))
    .send({ idToken: "x".repeat(150) }).expect(401);
  assert.match(response.body.error, /invalid or expired/i);
});

test("event discovery delegates query and filters to PostgreSQL RPC", async () => {
  let captured;
  const db = { ...context().db, rpc: async (name, args) => { captured = { name, args }; return { data: [], error: null }; } };
  await request(createApp(context({ db }))).get("/api/events?q=design&category=Creative&sort=title").expect(200).expect([]);
  assert.equal(captured.name, "search_events");
  assert.deepEqual(captured.args, { p_query: "design", p_category: "Creative", p_sort: "title", p_user_id: null });
});
