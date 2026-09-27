import { Router } from "express";
import { z } from "zod";
import { getAllSettings, setSetting } from "../db.js";
import { isRequestAuthed, requireAuth } from "../middleware/auth.js";
import { testConnection } from "../services/sabnzbd.js";
import { invalidateMediaCache, testArrConnection } from "../services/arr.js";
import { testConnection as testTeslaConnection } from "../services/teslamate.js";
import { testConnection as testTautulliConnection } from "../services/tautulli.js";
import { invalidateWeatherCache } from "../services/weather.js";
import { testConnection as testProwlarrConnection } from "../services/prowlarr.js";
import { isAssistantConfigured } from "../services/assistant.js";
import { callProvider } from "../services/assistantProviders.js";

export const settingsRouter = Router();

const SECRET_KEYS = ["password_hash", "sabnzbd_api_key", "sonarr_api_key", "radarr_api_key", "teslamate_api_token", "tautulli_api_key", "prowlarr_api_key", "portainer_api_key", "assistant_anthropic_api_key", "assistant_openai_api_key"];
const URL_KEYS = ["sabnzbd_url", "sonarr_url", "radarr_url", "teslamate_url", "tautulli_url", "prowlarr_url", "portainer_url", "assistant_ollama_url"];

settingsRouter.get("/", (req, res) => {
  const all = getAllSettings();
  const authed = isRequestAuthed(req);
  const visible = Object.fromEntries(
    Object.entries(all).filter(([key]) => !SECRET_KEYS.includes(key))
  );
  // Only reveal whether a service is configured, never the raw key.
  for (const service of ["sabnzbd", "sonarr", "radarr"]) {
    visible[`${service}_configured`] = String(
      Boolean(all[`${service}_url`] && all[`${service}_api_key`])
    );
  }
  // TeslaMateApi's token is optional (API_TOKEN_DISABLE=true), so a URL alone counts.
  visible.teslamate_configured = String(Boolean(all.teslamate_url));
  visible.tautulli_configured = String(Boolean(all.tautulli_url && all.tautulli_api_key));
  visible.weather_configured = String(Boolean(all.weather_latitude && all.weather_longitude));
  visible.prowlarr_configured = String(Boolean(all.prowlarr_url && all.prowlarr_api_key));
  visible.portainer_configured = String(Boolean(all.portainer_url && all.portainer_api_key));
  visible.assistant_configured = String(isAssistantConfigured());
  if (!authed) {
    for (const key of URL_KEYS) delete visible[key];
  }
  res.json(visible);
});

const updateSchema = z.record(z.string(), z.string());

settingsRouter.put("/", requireAuth, (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid settings payload" });
  for (const [key, value] of Object.entries(parsed.data)) {
    if (key === "password_hash") continue; // password changes go through /api/auth/set-password
    setSetting(key, value);
  }
  // Connection details may have changed — don't serve stale media from the old host.
  invalidateMediaCache();
  invalidateWeatherCache();
  res.json({ ok: true });
});

const testSchema = z.object({ url: z.string().min(1), apiKey: z.string().min(1) });

settingsRouter.post("/sabnzbd/test", requireAuth, async (req, res) => {
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "URL and API key required" });
  const result = await testConnection(parsed.data.url, parsed.data.apiKey);
  res.json(result);
});

const teslaTestSchema = z.object({ url: z.string().min(1), token: z.string().optional() });

settingsRouter.post("/teslamate/test", requireAuth, async (req, res) => {
  const parsed = teslaTestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "URL required" });
  const result = await testTeslaConnection(parsed.data.url, parsed.data.token ?? "");
  res.json(result);
});

settingsRouter.post("/tautulli/test", requireAuth, async (req, res) => {
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "URL and API key required" });
  const result = await testTautulliConnection(parsed.data.url, parsed.data.apiKey);
  res.json(result);
});

settingsRouter.post("/prowlarr/test", requireAuth, async (req, res) => {
  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "URL and API key required" });
  const result = await testProwlarrConnection(parsed.data.url, parsed.data.apiKey);
  res.json(result);
});

const assistantTestSchema = z.object({
  provider: z.enum(["ollama", "anthropic", "openai"]),
  ollamaUrl: z.string().optional(),
  ollamaModel: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  anthropicModel: z.string().optional(),
  openaiApiKey: z.string().optional(),
  openaiModel: z.string().optional(),
});

settingsRouter.post("/assistant/test", requireAuth, async (req, res) => {
  const parsed = assistantTestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid assistant config" });
  try {
    const reply = await callProvider(
      parsed.data,
      "Reply with exactly one word.",
      [{ role: "user", content: "Say OK." }],
      []
    );
    res.json({ ok: true, reply: reply.content.trim().slice(0, 80) });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : "Connection failed" });
  }
});

const arrTestSchema = testSchema.extend({ service: z.enum(["sonarr", "radarr"]) });

settingsRouter.post("/arr/test", requireAuth, async (req, res) => {
  const parsed = arrTestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Service, URL and API key required" });
  const result = await testArrConnection(parsed.data.service, parsed.data.url, parsed.data.apiKey);
  res.json(result);
});
