import { Router } from "express";
import { requireUser } from "../middleware/authenticate.js";
import { databaseError, queryResult } from "../http.js";

export function registrationRoutes({ db }) {
  const router = Router();
  router.use(requireUser);
  router.get("/", async (req, res, next) => {
    try {
      const rows = await queryResult(db.from("registrations")
        .select("id,status,created_at,events!inner(id,title,description,category,venue,starts_at,capacity,owner_id)")
        .eq("user_id", req.user.id).eq("status", "confirmed").order("created_at", { ascending: false }));
      res.json(rows.map((row) => ({ ...row.events, registration_id: row.id, registered: true, booked: 0 })));
    } catch (error) { next(error); }
  });
  return router;
}

export function savedRoutes({ db }) {
  const router = Router();
  router.use(requireUser);
  router.get("/", async (req, res, next) => {
    try {
      const { data, error } = await db.rpc("search_events", {
        p_query: "", p_category: "", p_sort: "date", p_user_id: req.user.id,
      });
      if (error) throw databaseError(error);
      res.json(data.filter((event) => event.saved));
    } catch (error) { next(error); }
  });
  return router;
}
