# Homebase

A self-hosted startpage / dashboard, in the spirit of [Flame](https://hub.docker.com/r/pawelmalak/flame), with a
modern UI, live SABnzbd downloads, a Sonarr/Radarr "recently added" media row, live status for your
Tesla, Plex, Prowlarr indexers and Docker containers, and a built-in AI assistant that can answer
questions about all of it.

## Features

- **App launcher & bookmarks** — pinned app icons up top, categorized bookmarks below. Drag-and-drop
  reordering, inline add/edit/delete in "Edit" mode.
- **Command palette** — press `⌘K` / `Ctrl+K` to fuzzy-search and launch any app instantly.
- **Web search fallback** — type in the search bar and hit Enter to fall back to your configured search
  engine when nothing local matches.
- **Recently added media** — posters, titles and descriptions for the latest movies and episodes
  imported by Radarr/Sonarr, so you can see what landed without opening either app. Click a poster
  for the full synopsis; for TV that's the *episode's* own title and overview (e.g. "Severance ·
  S02E05 — Trojan's Horse"), not just the series blurb.
- **Tesla widget** — battery level with charge-limit marker, range, charging power and time-to-full,
  odometer, cabin temperature, plus lock/sentry/window warnings. Fed from
  [TeslaMateApi](https://github.com/tobiasehlert/teslamateapi), the REST API that runs alongside
  TeslaMate (TeslaMate itself has no HTTP API). Poll rate adapts to the car's state so a sleeping
  car isn't queried needlessly.
- **Add movies & series** — search TMDB/TheTVDB *through* Radarr/Sonarr from the dashboard, pick a
  quality profile and root folder, and queue it with an immediate search. Titles already in your
  library are flagged and can't be added twice. Requires login when a password is set.
- **Weather** — current conditions, a 3-day outlook and sunrise/sunset via
  [Open-Meteo](https://open-meteo.com), which needs no API key or account. Pick your city by name in
  Settings; only coordinates are stored.
- **Now playing** — live Plex streams from Tautulli: who's watching what, progress, time remaining,
  and whether it's transcoding or direct play.
- **Upcoming** — what airs tonight and over the next week, from Sonarr's calendar, grouped by day
  with already-downloaded episodes dimmed.
- **App health dots** — each app tile carries a green/red dot from a reachability sweep every minute,
  so you can see what's down before clicking. A 401/403 counts as up: the service is running, it just
  wants credentials.
- **Live SABnzbd widget** — real-time queue with per-item progress bars, speed, ETA, and pause/resume/remove
  controls, pushed to the browser over WebSockets (no page refresh, no polling on the client).
- **Indexer status** — Prowlarr's indexer health at a glance: which indexers are blocked (with a "back in
  Nm" countdown from `disabledTill`), and any system health warnings/errors Prowlarr is reporting.
- **Container status** — which Docker containers on your host are running vs. exited/restarting/dead, via
  Portainer's API. No SSH or host-level Docker socket access needed — just a Portainer API token.
- **Docker host stats, service status & uptime** — approximate CPU/memory/disk usage of the Docker host
  (via Portainer), a compact reachability list for every tracked app, and Homebase's own process uptime
  with a recent-history sparkline.
- **"Ask anything" AI assistant** — a chat box built into the header that answers questions about your
  downloads, media library, indexers, containers, car and weather by calling straight into the same
  services these widgets use. Bring your own model: a local [Ollama](https://ollama.com) server, or a
  Claude/OpenAI API key. It can also add media to Sonarr/Radarr or pause/resume/remove downloads —
  but only after you explicitly approve that specific action, and only when you're signed in.
- **NAS monitoring (SNMPv3)** — CPU load, memory and per-volume storage usage read straight from your
  NAS's own SNMP agent (RFC 2790 Host Resources MIB), so it works against any NAS/NVR/server that
  exposes standard SNMP, not just a specific vendor. No vendor API or extra agent to install — just
  enable SNMPv3 in your NAS's network services settings and point Homebase at it.
- **Theming** — dark/light mode and a configurable accent color.
- **Optional password lock** — editing (adding/removing apps, changing settings) can be locked behind a
  password; browsing the dashboard itself is always open.
- **Single container** — the backend serves the built frontend, so the whole thing is one image with one
  data volume.

## Architecture

```
client/   React + TypeScript + Vite + Tailwind (the dashboard UI)
server/   Express + TypeScript + SQLite (better-sqlite3) + Socket.IO
```

The server exposes a REST API under `/api`, a WebSocket channel for live SABnzbd queue updates, and (in
production) serves the built client as static files — so the whole app runs as a single container on a
single port.

Weather is the only integration that talks to the public internet; everything else stays on your
LAN. Health checks only ever return a status code and timing to the browser, never a response body.

The Tesla widget reads `/api/v1/cars/:id/status` from TeslaMateApi and pushes snapshots over the same
Socket.IO channel as SABnzbd. Polling backs off by state — 10s while driving or charging, 30s when
online, 60s when asleep or offline — so it never keeps the car awake unnecessarily. The API token
(only needed when `API_TOKEN_DISABLE=false`) is stored server-side and never sent to the browser.

Adding media uses `movie/lookup` + `POST /movie` (Radarr) and `series/lookup` + `POST /series`
(Sonarr), with `searchForMovie` / `searchForMissingEpisodes` so a grab starts right away. Root
folders and quality profiles are read live from each instance rather than hard-coded. These endpoints
can queue downloads, so they sit behind the same auth gate as editing — the read-only "recently
added" row stays public.

Sonarr/Radarr metadata comes from your own instances — they already cache overviews and artwork
from TMDB/TheTVDB when they add media, so no third-party API key is needed. Cover art is proxied
through the backend (`/api/media/cover/...`), so the browser never sees an API key and doesn't need
internet access of its own; only `/MediaCover/` paths are proxied, so the endpoint can't be used as
a general request forwarder. Recently-added data is cached server-side for 60s and refreshed by the
client every 5 minutes.

SABnzbd credentials are stored server-side only; the browser never sees your API key. The server polls
SABnzbd's JSON API (`/api?mode=queue` / `mode=history`) on an adaptive interval — every 2s while something
is actively downloading, every 8s when idle — and broadcasts snapshots to all connected clients over
Socket.IO.

The indexer widget reads Prowlarr's `/api/v1/indexer`, `/api/v1/indexerstatus` and `/api/v1/health`
endpoints server-side and polls every 5 minutes (indexer health doesn't change second to second). A
blocked indexer's countdown is computed from `disabledTill` on each poll rather than trusted as a fixed
value, so it stays accurate between refreshes.

The container widget doesn't talk to Docker directly — it goes through Portainer's API
(`/api/endpoints/:id/docker/containers/json`), which proxies the Docker Engine API for whichever
environment you pick in Settings. That means no Docker socket needs to be mounted into Homebase and no
SSH access to the NAS is required, just a Portainer personal access token scoped to read access. Polled
every 60s.

The Docker host stats panel reads the same Portainer proxy's `/docker/info` (core count, total memory)
and `/docker/system/df` (image/container/volume disk usage) once, then fans out one
`/docker/containers/:id/stats?stream=false` call per running container (capped at 60) to sum CPU and
memory usage — the same numbers `docker stats` computes, just via Portainer's proxy instead of a local
socket. It's the Docker workload's footprint on the NAS, not a literal whole-OS reading (that would need
a host-level agent like Netdata or node_exporter), so it's labelled "Docker host" rather than claiming to
be the NAS's own telemetry.

The assistant is provider-agnostic: `server/src/services/assistantProviders.ts` normalizes Anthropic's
Messages API, OpenAI's Chat Completions API and Ollama's `/api/chat` into one shape, so
`server/src/services/assistant.ts` only has to implement the tool-calling loop once. Tools are thin
wrappers around the existing services (`get_downloads`, `get_recently_added`, `get_car_status`,
`get_indexer_status`, `get_containers`, `get_now_playing`, `get_weather`, `search_media`, and the two
that change something: `add_media` and `control_downloads`). A mutating tool call is never executed on
the strength of the model asking for it: the server returns it to the client as a `needs_confirmation`
step with nothing run yet, the client shows an approve/cancel prompt, and only a follow-up request
carrying that exact call's id runs it — and only if the request is authenticated, checked before looking
at approval at all, so a client can't approve its way past sign-in. Same pattern as every other
privileged action in this app: prompt for the password rather than silently failing or hiding the option.
API keys are stored server-side like every other integration; the browser never sees them.

The NAS widget speaks SNMPv3 directly to your NAS (`server/src/services/nas.ts`), reading only
standard, mandatory-in-the-spec OIDs: `sysDescr`/`sysUpTime`, the Host Resources `hrProcessorTable`
and `hrStorageTable` for CPU/volumes, with the richer net-snmpd `UCD-SNMP-MIB` extension
(`laLoad`/`memTotalReal`/`memAvailReal`) tried first and silently falling back to the Host Resources
equivalents when an agent doesn't expose it. This is deliberate: ASUSTOR (and most NAS vendors)
publish no public API or MIB docs for their own per-disk SMART/temperature data, so rather than guess
at private enterprise OIDs, Homebase reads only what every compliant SNMP agent is required to
expose, plus one diagnostic tool — **Settings → NAS → Run diagnostic walk** — that walks the storage
table on your own configured NAS and shows every OID/type/value it finds, so vendor-specific OIDs
(once known) can be added later based on what your actual hardware reports rather than
documentation that doesn't exist. Auth/privacy keys are stored server-side like every other
integration's credentials.

## Running locally (development)

```bash
# terminal 1
cd server
cp .env.example .env
npm install
npm run dev        # http://localhost:5000

# terminal 2
cd client
npm install
npm run dev         # http://localhost:5173 (proxies /api and /socket.io to :5000)
```

## Running with Docker Compose

```bash
docker compose up -d --build
```

The app will be available at `http://<host>:5000`. Data (SQLite DB) persists in the `homebase_data` named
volume.

## Deploying via Portainer

1. In Portainer, go to **Stacks → Add stack**.
2. Choose **Repository** and point it at this repo (or paste the contents of `docker-compose.yml` under
   **Web editor**).
3. Before deploying, set a real `JWT_SECRET` value (used to sign edit-mode login sessions) — either edit
   the environment variable in the stack editor, or add it under **Environment variables** in the Portainer
   UI.
4. Deploy the stack. Portainer will build the image from the included `Dockerfile` and start the
   `homebase` container with a persistent `homebase_data` volume.
5. Open `http://<host>:5000`, go to **Settings → Downloads**, and enter your SABnzbd URL + API key (found
   in SABnzbd under **Config → General**).
6. Optionally connect Sonarr and Radarr under **Settings → Media** (API key is in each app under
   *Settings → General*) to get the "Recently added" poster row.
7. Optionally connect TeslaMateApi under **Settings → Car** — enter its URL (usually port 8080), hit
   **Test & list cars** to discover your vehicles, pick one, and save.
8. Optionally set your city under **Settings → Weather**, and connect Tautulli under
   **Settings → Plex** for the now-playing widget.
9. Optionally connect Prowlarr under **Settings → Indexers** (URL + API key, found in Prowlarr under
   *Settings → General*) for indexer health.
10. Optionally connect Portainer under **Settings → Docker** — enter its URL and an
    [API token](https://docs.portainer.io/api/access) (Portainer → your user → **Access tokens**), hit
    **Test & list environments**, and pick the environment your containers run under (usually `1` for
    local Docker on the NAS itself). This also powers the Docker host stats panel.
11. Optionally set up the AI assistant under **Settings → Assistant** — pick Ollama (paste its URL and a
    model name already pulled there) or Claude/OpenAI (paste an API key), hit **Test**, and save. The
    "Ask anything" bar appears in the header once a provider is configured.
12. Optionally connect your NAS under **Settings → NAS** — enable SNMPv3 in your NAS's network
    services settings first (ASUSTOR: ADM → **Settings → Services → SNMP**), then enter its IP,
    SNMP username, and the auth/privacy protocols + passwords you configured there, and hit **Test**.
13. Optionally set a password under **Settings → Security** to lock editing.

## Configuration reference

| Env var       | Default             | Purpose                                              |
| ------------- | -------------------- | ----------------------------------------------------- |
| `PORT`        | `5000`               | Port the server listens on                            |
| `DATA_DIR`    | `/data`               | Where the SQLite database is stored                   |
| `JWT_SECRET`  | *(insecure default)* | Secret used to sign edit-mode login tokens — set this! |
| `CORS_ORIGIN` | *(same-origin)*      | Only needed if you split client/server across origins |

All other configuration (SABnzbd/Sonarr/Radarr/TeslaMate connections, theme, greeting, search engine, password) lives in the
database and is managed from the in-app **Settings** panel — nothing else needs to be set via environment
variables or config files.

## Roadmap / ideas to make it even more awesome

The SABnzbd widget is built on a small, self-contained service module
(`server/src/services/sabnzbd.ts`) specifically so more *arr-stack integrations can be added the same way
without touching the rest of the app. Natural next steps:

- **More live widgets**: Overseerr/Ombi (pending requests), a torrent client alongside the Usenet one.
- **More assistant tools**: Overseerr/Ombi requests, Tautulli history, TeslaMate driving history — anything
  with a service module already has the shape the assistant's tools expect.
- **Multi-user profiles**: separate dashboards/layouts per household member, each with their own pinned
  apps.
- **Notifications**: desktop/browser push when a SABnzbd job completes or fails, or a monitored service
  goes down.
- **Import/export**: JSON export of the whole layout (apps, bookmarks, categories, settings) for backup or
  syncing between instances.
- **Custom CSS / widget layout editor**: drag widgets (not just app icons) around a grid, resize them,
  toggle visibility.
- **Reverse-proxy awareness**: auto-detect internal vs. external URLs (LAN IP vs. domain) and pick the
  right one depending on where the browser is connecting from — a genuinely nice Flame-beating feature.

The rest are not implemented yet, but the codebase is structured (typed REST API, a settings table for
arbitrary config, a Socket.IO channel already wired up) so each one is an incremental addition rather than
a rewrite.
