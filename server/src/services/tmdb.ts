import { getSetting } from "../db.js";

/**
 * TMDB is the second service (after weather) that talks to the public
 * internet rather than something on the LAN — it's the only source for
 * "what's trending right now," which Sonarr/Radarr's lookup endpoints don't
 * expose (they only search for a title you already have in mind). A TMDB
 * API key is free to get and required for this one feature only; everything
 * else in the assistant still works without it.
 */
const API_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w342";

export interface TrendingItem {
  id: number;
  kind: "movie" | "tv";
  title: string;
  overview: string;
  poster: string | null;
  releaseDate: string | null;
  rating: number | null;
}

export interface TrendingResult {
  configured: boolean;
  error?: string;
  items: TrendingItem[];
}

function apiKey(): string | null {
  return getSetting("tmdb_api_key") || null;
}

function posterUrl(path: string | null | undefined): string | null {
  return path ? `${IMAGE_BASE}${path}` : null;
}

export async function getTrending(
  kind: "movie" | "tv",
  window: "day" | "week" = "day"
): Promise<TrendingResult> {
  const key = apiKey();
  if (!key) {
    return {
      configured: false,
      error: "TMDB isn't configured — add an API key in Settings → Media to enable trending lookups.",
      items: [],
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${API_BASE}/trending/${kind}/${window}?api_key=${encodeURIComponent(key)}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const results: any[] = Array.isArray(data.results) ? data.results : [];

    return {
      configured: true,
      items: results.slice(0, 10).map((r) => ({
        id: r.id,
        kind,
        title: (kind === "movie" ? r.title : r.name) ?? "Unknown",
        overview: r.overview ?? "",
        poster: posterUrl(r.poster_path),
        releaseDate: (kind === "movie" ? r.release_date : r.first_air_date) ?? null,
        rating: typeof r.vote_average === "number" ? r.vote_average : null,
      })),
    };
  } catch (err) {
    return { configured: true, error: err instanceof Error ? err.message : "unreachable", items: [] };
  } finally {
    clearTimeout(timeout);
  }
}

export async function testConnection(key: string): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${API_BASE}/authentication?api_key=${encodeURIComponent(key)}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, error: body?.status_message ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  } finally {
    clearTimeout(timeout);
  }
}
