import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { authRouter } from "./routes/auth.js";
import { itemsRouter } from "./routes/items.js";
import { settingsRouter } from "./routes/settings.js";
import { sabnzbdRouter } from "./routes/sabnzbd.js";
import { mediaRouter } from "./routes/media.js";
import { teslamateRouter } from "./routes/teslamate.js";
import { weatherRouter } from "./routes/weather.js";
import { tautulliRouter } from "./routes/tautulli.js";
import { healthRouter } from "./routes/health.js";
import { prowlarrRouter } from "./routes/prowlarr.js";
import { portainerRouter } from "./routes/portainer.js";
import { assistantRouter } from "./routes/assistant.js";
import { nasRouter } from "./routes/nas.js";
import { getSnapshot, startSabnzbdPolling } from "./services/sabnzbd.js";
import { getSnapshot as getTeslaSnapshot, startTeslaPolling } from "./services/teslamate.js";
import { getActivity, startTautulliPolling } from "./services/tautulli.js";
import { snapshot as healthSnapshot, startHealthPolling } from "./services/health.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 5000);
const CLIENT_DIST = process.env.CLIENT_DIST ?? path.join(__dirname, "../public");

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN ?? true, credentials: true }));
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api", itemsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/sabnzbd", sabnzbdRouter);
app.use("/api/media", mediaRouter);
app.use("/api/teslamate", teslamateRouter);
app.use("/api/weather", weatherRouter);
app.use("/api/tautulli", tautulliRouter);
app.use("/api/health-checks", healthRouter);
app.use("/api/prowlarr", prowlarrRouter);
app.use("/api/portainer", portainerRouter);
app.use("/api/assistant", assistantRouter);
app.use("/api/nas", nasRouter);

if (fs.existsSync(CLIENT_DIST)) {
  app.use(
    express.static(CLIENT_DIST, {
      setHeaders(res, filePath) {
        // Vite fingerprints everything under /assets, so those can be cached
        // forever. index.html must not be, or a browser keeps loading the old
        // bundle after a redeploy — which looks exactly like a missing feature.
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    })
  );
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN ?? true, credentials: true },
});

io.on("connection", async (socket) => {
  socket.emit("sabnzbd:update", await getSnapshot());
  socket.emit("teslamate:update", await getTeslaSnapshot());
  socket.emit("tautulli:update", await getActivity());
  socket.emit("health:update", healthSnapshot());
});

startSabnzbdPolling(io);
startTeslaPolling(io);
startTautulliPolling(io);
startHealthPolling(io);

httpServer.listen(PORT, () => {
  console.log(`Homebase server listening on port ${PORT}`);
});
