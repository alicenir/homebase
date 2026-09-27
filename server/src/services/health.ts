import type { Server } from "socket.io";
import { db } from "../db.js";
import { lanFetch } from "../lib/lanFetch.js";

export type HealthState = "up" | "down" | "unknown";

export interface HealthEntry {
  state: HealthState;
  status: number | null;
  latencyMs: number | null;
  checkedAt: string;
  since: string | null;
}

const results = new Map<number, HealthEntry>();

export interface UptimeInfo {
  /** Homebase's own process uptime, in seconds. */
  processUptimeSeconds: number;
  /** Rolling history of "fraction of tracked apps reachable" per sweep, oldest first. */
  history: { at: string; fractionUp: number }[];
}

const HISTORY_LIMIT = 120; // 2 hours at the 60s poll interval
const history: { at: string; fractionUp: number }[] = [];

export function uptimeInfo(): UptimeInfo {
  return { processUptimeSeconds: Math.floor(process.uptime()), history };
}

/**
 * Checks one of the user's own app URLs. These are addresses they typed into
 * their own dashboard, so this is deliberately not restricted the way the
 * cover-art proxy is — but nothing is returned to the browser except a
 * status code and timing, so it can't be used to read a response body.
 */
async function probe(url: string): Promise<{ state: HealthState; status: number | null; latencyMs: number | null }> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    let res: Response;
    try {
      res = await lanFetch(url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
      // Plenty of apps don't implement HEAD; fall back rather than call it down.
      if (res.status === 405 || res.status === 501) {
        res = await lanFetch(url, { method: "GET", signal: controller.signal, redirect: "follow" });
      }
    } catch {
      res = await lanFetch(url, { method: "GET", signal: controller.signal, redirect: "follow" });
    }

    // Anything that answers is "up" — a 401/403 means the service is running
    // and simply wants credentials we deliberately don't have.
    return {
      state: res.status < 500 ? "up" : "down",
      status: res.status,
      latencyMs: Date.now() - started,
    };
  } catch {
    return { state: "down", status: null, latencyMs: null };
  } finally {
    clearTimeout(timeout);
  }
}

function trackedItems(): { id: number; url: string }[] {
  return db
    .prepare("SELECT id, url FROM items WHERE type = 'app' OR is_pinned = 1")
    .all() as { id: number; url: string }[];
}

export async function checkAll(): Promise<Record<number, HealthEntry>> {
  const items = trackedItems();
  const now = new Date().toISOString();

  await Promise.all(
    items.map(async (item) => {
      if (!/^https?:\/\//i.test(item.url)) return;
      const result = await probe(item.url);
      const previous = results.get(item.id);
      results.set(item.id, {
        ...result,
        checkedAt: now,
        // Keep the timestamp of the last state change so the UI can say
        // "down for 4m" rather than just "down".
        since: previous && previous.state === result.state ? previous.since : now,
      });
    })
  );

  // Drop entries for items that no longer exist.
  const live = new Set(items.map((i) => i.id));
  for (const id of results.keys()) if (!live.has(id)) results.delete(id);

  const checked = [...results.values()].filter((r) => r.state !== "unknown");
  if (checked.length > 0) {
    const fractionUp = checked.filter((r) => r.state === "up").length / checked.length;
    history.push({ at: now, fractionUp });
    if (history.length > HISTORY_LIMIT) history.shift();
  }

  return snapshot();
}

export function snapshot(): Record<number, HealthEntry> {
  return Object.fromEntries(results);
}

let pollHandle: ReturnType<typeof setTimeout> | null = null;

export function startHealthPolling(io: Server) {
  const tick = async () => {
    try {
      io.emit("health:update", await checkAll());
    } catch {
      /* keep polling regardless */
    }
    pollHandle = setTimeout(tick, 60_000);
  };
  // Give the server a moment to settle before the first sweep.
  pollHandle = setTimeout(tick, 3000);
}

export function stopHealthPolling() {
  if (pollHandle) clearTimeout(pollHandle);
}
