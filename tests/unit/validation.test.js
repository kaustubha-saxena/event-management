import test from "node:test";
import assert from "node:assert/strict";
import { eventSchema, parse, searchSchema } from "../../server/validation.js";

test("event input accepts bounded future events", () => {
  const event = parse(eventSchema, {
    title: "Design workshop", description: "A practical campus design workshop for students.",
    category: "Creative", venue: "Design studio", starts_at: new Date(Date.now() + 86400000).toISOString(), capacity: "25",
  });
  assert.equal(event.capacity, 25);
});

test("event validation rejects invalid category, capacity, and past dates", () => {
  assert.throws(() => parse(eventSchema, {
    title: "No", description: "short", category: "Other", venue: "X",
    starts_at: "2020-01-01T00:00:00Z", capacity: 0,
  }));
});

test("search parameters are normalized and bounded", () => {
  assert.deepEqual(parse(searchSchema, { q: "  design  ", category: "", sort: "title" }), { q: "design", category: "", sort: "title" });
  assert.throws(() => parse(searchSchema, { q: "x".repeat(101) }));
});
