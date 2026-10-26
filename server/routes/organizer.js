import { Router } from "express";
import { requireOrganizer, requireUser } from "../middleware/authenticate.js";
import { databaseError, queryResult } from "../http.js";

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function organizerRoutes({ db }) {
  const router = Router();
  router.use(requireUser, requireOrganizer);
  router.get("/analytics", async (req, res, next) => {
    try {
      const data = await queryResult(db.rpc("organizer_analytics", { p_owner_id: req.user.id }));
      res.json(data);
    } catch (error) { next(error); }
  });
  router.get("/events/:id/attendees.csv", async (req, res, next) => {
    try {
      const { data: event, error: eventError } = await db.from("events").select("id,title")
        .eq("id", req.params.id).eq("owner_id", req.user.id).maybeSingle();
      if (eventError) throw databaseError(eventError);
      if (!event) return res.status(404).json({ error: "Event not found or not owned by you." });
      const attendees = await queryResult(db.from("registrations")
        .select("created_at,profiles!registrations_user_id_fkey(full_name,email)")
        .eq("event_id", event.id).eq("status", "confirmed").order("created_at"));
      const lines = [["Name", "Email", "Registered at"], ...attendees.map((row) => [row.profiles.full_name,row.profiles.email,row.created_at])]
        .map((row) => row.map(csvCell).join(",")).join("\r\n");
      res.set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="campusflow-attendees-${event.id}.csv"`,
        "Cache-Control": "no-store",
      }).send(`\uFEFF${lines}`);
    } catch (error) { next(error); }
  });
  return router;
}
