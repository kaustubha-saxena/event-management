import test from "node:test";
import assert from "node:assert/strict";
import { app } from "../server/app.js";
import { pool, query } from "../server/db.js";
import { hashPassword } from "../server/security.js";

test("MySQL-backed end-to-end API checks", async (t) => {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const ids = [];
  const stamp = Date.now();
  const cookies = {};
  let eventId;
  async function request(path, method = "GET", body, user) {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookies[user] ? { Cookie: cookies[user] } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const c = r.headers.get("set-cookie");
    if (c && user) cookies[user] = c.split(";")[0];
    return { status: r.status, body: await r.json() };
  }
  try {
    for (const name of ["one", "two"])
      await t.test("Register " + name, async () => {
        const r = await request(
          "/auth/register",
          "POST",
          {
            name: "Test " + name,
            email: `${name}-${stamp}@example.test`,
            password: "TestPassword!2026",
          },
          name,
        );
        assert.equal(r.status, 201);
        ids.push(r.body.user.id);
        assert.equal(r.body.user.role, "student");
      });
    const organizer = await query(
      "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)",
      [
        "Test organizer",
        `organizer-${stamp}@example.test`,
        hashPassword("TestPassword!2026"),
        "organizer",
      ],
    );
    ids.push(organizer.insertId);
    await t.test("Organizer login and session", async () => {
      assert.equal(
        (
          await request(
            "/auth/login",
            "POST",
            {
              email: `organizer-${stamp}@example.test`,
              password: "TestPassword!2026",
            },
            "org",
          )
        ).status,
        200,
      );
      assert.equal(
        (await request("/auth/me", "GET", undefined, "org")).body.user.role,
        "organizer",
      );
    });
    const event = {
      title: "Test single-seat event " + stamp,
      description:
        "A test event for integration checks and capacity protection.",
      category: "Technology",
      venue: "Test Hall",
      capacity: 1,
      starts_at: new Date(Date.now() + 86400000).toISOString(),
    };
    await t.test("Anonymous and student cannot create events", async () => {
      assert.equal((await request("/events", "POST", event)).status, 401);
      assert.equal(
        (await request("/events", "POST", event, "one")).status,
        403,
      );
    });
    await t.test("Organizer creates event; invalid date rejected", async () => {
      assert.equal(
        (
          await request(
            "/events",
            "POST",
            { ...event, starts_at: "bad" },
            "org",
          )
        ).status,
        400,
      );
      const r = await request("/events", "POST", event, "org");
      assert.equal(r.status, 201);
      eventId = r.body.id;
    });
    await t.test("Search and category filter", async () => {
      const r = await request(
        "/events?q=" + encodeURIComponent(event.title) + "&category=Technology",
      );
      assert.equal(r.body.length, 1);
      assert.equal(r.body[0].id, eventId);
      assert.equal(
        (await request("/events?q=" + stamp + "&category=Creative")).body
          .length,
        0,
      );
    });
    await t.test("Saved events persist across requests", async () => {
      assert.equal(
        (await request(`/events/${eventId}/save`, "POST", {}, "one")).status,
        200,
      );
      assert.equal(
        (await request("/events?q=" + stamp, "GET", undefined, "one")).body[0]
          .saved,
        1,
      );
      await request(`/events/${eventId}/save`, "DELETE", {}, "one");
      assert.equal(
        (await request("/events?q=" + stamp, "GET", undefined, "one")).body[0]
          .saved,
        0,
      );
    });
    let winner;
    await t.test("Concurrent booking never overbooks", async () => {
      const results = await Promise.all(
        ["one", "two"].map((u) =>
          request(`/events/${eventId}/book`, "POST", {}, u),
        ),
      );
      assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
      winner = results[0].status === 201 ? "one" : "two";
      assert.equal(
        (
          await query("SELECT COUNT(*) AS n FROM bookings WHERE event_id=?", [
            eventId,
          ])
        )[0].n,
        1,
      );
    });
    await t.test("Duplicate booking and attendee permissions", async () => {
      assert.equal(
        (await request(`/events/${eventId}/book`, "POST", {}, winner)).status,
        409,
      );
      assert.equal(
        (await request(`/events/${eventId}/attendees`, "GET", undefined, "one"))
          .status,
        403,
      );
      assert.equal(
        (await request(`/events/${eventId}/attendees`, "GET", undefined, "org"))
          .body.length,
        1,
      );
    });
    await t.test("Edit and cancellation", async () => {
      assert.equal(
        (
          await request(
            `/events/${eventId}`,
            "PUT",
            { ...event, title: "Updated " + event.title },
            "org",
          )
        ).status,
        200,
      );
      assert.equal(
        (await request(`/events/${eventId}/book`, "DELETE", {}, winner)).status,
        200,
      );
      assert.equal(
        (
          await query("SELECT COUNT(*) AS n FROM bookings WHERE event_id=?", [
            eventId,
          ])
        )[0].n,
        0,
      );
    });
    await t.test("Server validation and SQL injection resistance", async () => {
      assert.equal(
        (
          await request(
            "/auth/login",
            "POST",
            { email: "x'or(1=1)--@test.com", password: "invalidpassword" },
            "invalid",
          )
        ).status,
        401,
      );
      assert.equal(
        (
          await request("/auth/register", "POST", {
            name: "X",
            email: "bad",
            password: "x",
          })
        ).status,
        400,
      );
    });
    await t.test("Logout invalidates session", async () => {
      await request("/auth/logout", "POST", {}, "one");
      assert.equal(
        (await request("/auth/me", "GET", undefined, "one")).body.user,
        null,
      );
    });
    await t.test("Delete cascades", async () => {
      await request(`/events/${eventId}/save`, "POST", {}, "two");
      assert.equal(
        (await request(`/events/${eventId}`, "DELETE", {}, "org")).status,
        200,
      );
      assert.equal(
        (
          await query(
            "SELECT COUNT(*) AS n FROM saved_events WHERE event_id=?",
            [eventId],
          )
        )[0].n,
        0,
      );
    });
  } finally {
    if (eventId) await query("DELETE FROM events WHERE id=?", [eventId]);
    for (const id of ids) await query("DELETE FROM users WHERE id=?", [id]);
    await new Promise((r) => server.close(r));
    await pool.end();
  }
});
