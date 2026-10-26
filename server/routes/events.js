import { Router } from "express";
import { categories, eventSchema, idSchema, parse, searchSchema } from "../validation.js";
import { databaseError, httpError, queryResult } from "../http.js";
import { requireOrganizer, requireUser } from "../middleware/authenticate.js";
import { issueToken } from "../services/ticket-crypto.js";

export function eventRoutes({ db, config }) {
  const router = Router();
  router.get("/", async (req, res, next) => {
    try {
      const filters = parse(searchSchema, req.query);
      const rows = await queryResult(db.rpc("search_events", {
        p_query: filters.q,
        p_category: filters.category,
        p_sort: filters.sort,
        p_user_id: req.user?.id ?? null,
      }));
      res.json(rows);
    } catch (error) { next(error); }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const id = parse(idSchema, req.params.id);
      const event = await queryResult(db.from("events")
        .select("id,title,description,category,venue,starts_at,capacity,owner_id,profiles!events_owner_id_fkey(full_name)")
        .eq("id", id).maybeSingle());
      if (!event) throw httpError(404, "Event not found.");
      const { count, error } = await db.from("registrations").select("id", { count: "exact", head: true })
        .eq("event_id", id).eq("status", "confirmed");
      if (error) throw databaseError(error);
      res.json({ ...event, organizer: event.profiles?.full_name ?? "CampusFlow organizer", booked: count ?? 0 });
    } catch (error) { next(error); }
  });

  router.post("/", requireUser, requireOrganizer, async (req, res, next) => {
    try {
      const event = parse(eventSchema, req.body);
      const row = await queryResult(db.from("events").insert({ ...event, owner_id: req.user.id })
        .select("id").single());
      res.status(201).json({ id: row.id });
    } catch (error) { next(error); }
  });

  router.put("/:id", requireUser, requireOrganizer, async (req, res, next) => {
    try {
      const id = parse(idSchema, req.params.id);
      const event = parse(eventSchema, req.body);
      const updated = await queryResult(db.rpc("update_owned_event", {
        p_owner_id: req.user.id, p_event_id: id, p_title: event.title,
        p_description: event.description, p_category: event.category,
        p_venue: event.venue, p_starts_at: event.starts_at, p_capacity: event.capacity,
      }));
      if (!updated) throw httpError(404, "Event not found or not owned by you.");
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  router.delete("/:id", requireUser, requireOrganizer, async (req, res, next) => {
    try {
      const id = parse(idSchema, req.params.id);
      const deleted = await queryResult(db.rpc("delete_owned_event", { p_owner_id: req.user.id, p_event_id: id }));
      if (!deleted) throw httpError(404, "Event not found or not owned by you.");
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  router.post("/:id/registrations", requireUser, async (req, res, next) => {
    try {
      const id = parse(idSchema, req.params.id);
      const ticket = issueToken(config.ticketKey);
      const result = await queryResult(db.rpc("register_for_event", {
        p_user_id: req.user.id, p_event_id: id,
        p_token_hash: ticket.hash, p_token_ciphertext: ticket.ciphertext,
      }));
      res.status(201).json({ ...result, token: ticket.token });
    } catch (error) { next(error); }
  });

  router.delete("/:id/registrations", requireUser, async (req, res, next) => {
    try {
      const id = parse(idSchema, req.params.id);
      const cancelled = await queryResult(db.rpc("cancel_registration", { p_user_id: req.user.id, p_event_id: id }));
      if (!cancelled) throw httpError(404, "Registration not found.");
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  router.get("/:id/attendees", requireUser, requireOrganizer, async (req, res, next) => {
    try {
      const id = parse(idSchema, req.params.id);
      const owns = await queryResult(db.from("events").select("id").eq("id", id).eq("owner_id", req.user.id).maybeSingle());
      if (!owns) throw httpError(404, "Event not found or not owned by you.");
      const attendees = await queryResult(db.from("registrations")
        .select("created_at,profiles!registrations_user_id_fkey(full_name,email)")
        .eq("event_id", id).eq("status", "confirmed").order("created_at"));
      res.json(attendees.map((row) => ({ ...row.profiles, created_at: row.created_at })));
    } catch (error) { next(error); }
  });

  router.post("/:id/save", requireUser, async (req, res, next) => {
    try {
      const id = parse(idSchema, req.params.id);
      await queryResult(db.from("saved_events").upsert({ user_id: req.user.id, event_id: id }, { onConflict: "user_id,event_id", ignoreDuplicates: true }));
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  router.delete("/:id/save", requireUser, async (req, res, next) => {
    try {
      const id = parse(idSchema, req.params.id);
      await queryResult(db.from("saved_events").delete().eq("user_id", req.user.id).eq("event_id", id));
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  return router;
}
