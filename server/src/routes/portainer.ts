import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { getHostStats, getStatus, listEndpoints } from "../services/portainer.js";

export const portainerRouter = Router();

portainerRouter.get("/status", async (_req, res) => {
  res.json(await getStatus());
});

portainerRouter.get("/hoststats", async (_req, res) => {
  res.json(await getHostStats());
});

const endpointsSchema = z.object({ url: z.string().min(1), apiKey: z.string().min(1) });

// Listing environments is how you discover which endpoint ID to use, so it
// needs the raw key up front — gate it behind auth like the other test routes.
portainerRouter.post("/endpoints", requireAuth, async (req, res) => {
  const parsed = endpointsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "URL and API key required" });
  res.json(await listEndpoints(parsed.data.url, parsed.data.apiKey));
});
