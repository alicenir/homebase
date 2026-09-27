import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getStatus, walk } from "../services/nas.js";

export const nasRouter = Router();

nasRouter.get("/status", async (_req, res) => {
  res.json(await getStatus());
});

const walkSchema = z.object({ oid: z.string().regex(/^[0-9.]+$/).optional() });

// Diagnostic only — lets a specific NAS's real OID tree be inspected since
// ASUSTOR has no public MIB docs to build per-disk temperature/SMART
// support against. Auth-gated: a walk can return more than the summary
// status does.
nasRouter.post("/walk", requireAuth, async (req, res) => {
  const parsed = walkSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid OID" });
  res.json(await walk(parsed.data.oid));
});
