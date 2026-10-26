import { Router } from "express";
import QRCode from "qrcode";
import { requireOrganizer, requireUser } from "../middleware/authenticate.js";
import { databaseError, httpError, queryResult } from "../http.js";
import { idSchema, checkInSchema, parse } from "../validation.js";
import { decryptToken, hashToken } from "../services/ticket-crypto.js";

export function ticketRoutes({ db, config }) {
  const router = Router();
  router.get("/", requireUser, async (req, res, next) => {
    try {
      const rows = await queryResult(db.from("tickets")
        .select("id,status,issued_at,checked_in_at,token_ciphertext,registrations!inner(user_id,status,events!inner(id,title,starts_at,venue))")
        .eq("registrations.user_id", req.user.id).order("issued_at", { ascending: false }));
      const tickets = await Promise.all(rows.map(async (row) => {
        const token = decryptToken(row.token_ciphertext, config.ticketKey);
        return {
          id: row.id, status: row.status, issued_at: row.issued_at, checked_in_at: row.checked_in_at,
          token, event: row.registrations.events,
          qr: await QRCode.toDataURL(token, { errorCorrectionLevel: "H", margin: 2, width: 280 }),
        };
      }));
      res.json(tickets);
    } catch (error) { next(error); }
  });
  router.get("/:id", requireUser, async (req, res, next) => {
    try {
      const id = parse(idSchema, req.params.id);
      const row = await queryResult(db.from("tickets")
        .select("id,status,issued_at,checked_in_at,token_ciphertext,registrations!inner(user_id,status,events!inner(id,title,starts_at,venue))")
        .eq("id", id).eq("registrations.user_id", req.user.id).maybeSingle());
      if (!row) throw httpError(404, "Ticket not found.");
      const token = decryptToken(row.token_ciphertext, config.ticketKey);
      res.json({ id: row.id, status: row.status, issued_at: row.issued_at, checked_in_at: row.checked_in_at,
        token, event: row.registrations.events,
        qr: await QRCode.toDataURL(token, { errorCorrectionLevel: "H", margin: 2, width: 280 }) });
    } catch (error) { next(error); }
  });
  router.post("/check-in", requireUser, requireOrganizer, async (req, res, next) => {
    try {
      const { token } = parse(checkInSchema, req.body);
      const result = await queryResult(db.rpc("check_in_ticket", {
        p_token_hash: hashToken(token), p_actor_id: req.user.id,
      }));
      res.json(result);
    } catch (error) { next(error); }
  });
  return router;
}
