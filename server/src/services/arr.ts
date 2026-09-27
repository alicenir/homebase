import { getSetting } from "../db.js";
import { lanFetch } from "../lib/lanFetch.js";

export type ArrService = "sonarr" | "radarr";

export interface MediaItem {
  id: string;
  service: ArrService;
  kind: "movie" | "episode";
  /** Movie title, or series title for an episode. */
  title: string;
  /** "S02E05 · Trojan's Horse" for episodes; year for movies. */
  subtitle: string;
  /** Episode overview when available, else the movie/series overview. */
  overview: string;
  year: number | null;
  /** Path on our own API that proxies the cover art (keeps the API key server-side). */
  poster: string | null;
  addedAt: string;
  runtime: number | null;
  genres: string[];
  rating: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  /** Deep link into Sonarr/Radarr for the full details. */
  link: string | null;
  quality: string | null;
}

export interface MediaSnapshot {
  configured: boolean;
  items: MediaItem[];
  errors: { service: ArrService; message: string }[];
}

/**
 * Radarr/Sonarr history eventType for "downloaded and imported".
 *
 * The API binds this parameter as an integer enum — passing the string name
 * ("downloadFolderImported") is rejected with HTTP 400. Responses, confusingly,
 * serialise the same field *as* that string, which is what we match on when we
 * have to filter client-side.
 */
const EVENT_DOWNLOAD_IMPORTED_ID = "3";
const EVENT_DOWNLOAD_IMPORTED_NAME = "downloadFolderImported";

function config(service: ArrService): { url: string; apiKey: string } | null {
  const url = getSetting(`${service}_url`);
  const apiKey = getSetting(`${service}_api_key`);
  if (!url || !apiKey) return null;
  return { url: url.replace(/\/+$/, ""), apiKey };
}

async function callArr(
  service: ArrService,
  path: string,
  params: Record<string, string> = {}
): Promise<any> {
  const cfg = config(service);
  if (!cfg) throw new Error("not_configured");

  const qs = new URLSearchParams(params).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await lanFetch(`${cfg.url}${path}${qs ? `?${qs}` : ""}`, {
      headers: { "X-Api-Key": cfg.apiKey },
      signal: controller.signal,
    });
    if (res.status === 401) throw new Error("Invalid API key");
    if (!res.ok) throw new Error(`HTTP ${res.status}${await describeError(res)}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function postArr(service: ArrService, path: string, body: unknown): Promise<any> {
  const cfg = config(service);
  if (!cfg) throw new Error("not_configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await lanFetch(`${cfg.url}${path}`, {
      method: "POST",
      headers: { "X-Api-Key": cfg.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 401) throw new Error("Invalid API key");
    if (!res.ok) throw new Error(`HTTP ${res.status}${await describeError(res)}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/** Pulls the validation message out of an *arr error body, if there is one. */
async function describeError(res: Response): Promise<string> {
  try {
    const text = (await res.text()).slice(0, 300);
    if (!text) return "";
    try {
      const parsed = JSON.parse(text);
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      const detail = first?.errorMessage ?? first?.message;
      if (detail) return ` — ${first.propertyName ? `${first.propertyName}: ` : ""}${detail}`;
    } catch {
      /* not JSON, fall through to the raw text */
    }
    return ` — ${text}`;
  } catch {
    return "";
  }
}

/**
 * Requests history filtered to imports. Older/newer *arr builds disagree about
 * the eventType parameter, so if the filtered call is rejected we retry
 * unfiltered and narrow the records ourselves.
 */
async function fetchImportHistory(
  service: ArrService,
  limit: number,
  extra: Record<string, string>
): Promise<any[]> {
  const base = {
    page: "1",
    pageSize: String(limit),
    sortKey: "date",
    sortDirection: "descending",
    ...extra,
  };

  let data: any;
  try {
    data = await callArr(service, "/api/v3/history", {
      ...base,
      eventType: EVENT_DOWNLOAD_IMPORTED_ID,
    });
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith("HTTP 400")) throw err;
    // Ask for more rows since we're about to discard the non-import events.
    data = await callArr(service, "/api/v3/history", {
      ...base,
      pageSize: String(limit * 5),
    });
  }

  const records: any[] = data?.records ?? [];
  return records.filter(
    (r) => !r?.eventType || r.eventType === EVENT_DOWNLOAD_IMPORTED_NAME
  );
}

function posterPath(service: ArrService, images: any[] | undefined): string | null {
  if (!Array.isArray(images)) return null;
  const poster = images.find((i) => i?.coverType === "poster") ?? images[0];
  // Prefer the *arr-local MediaCover path so we can proxy it with the API key;
  // remoteUrl would require the browser itself to reach TMDB/TheTVDB.
  const local: string | undefined = poster?.url;
  if (local && local.startsWith("/MediaCover/")) {
    return `/api/media/cover/${service}?path=${encodeURIComponent(local)}`;
  }
  return poster?.remoteUrl ?? null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

async function fetchRadarr(limit: number): Promise<MediaItem[]> {
  const records = await fetchImportHistory("radarr", limit, { includeMovie: "true" });

  const cfg = config("radarr");
  const seen = new Set<number>();
  const items: MediaItem[] = [];

  for (const record of records) {
    const movie = record.movie;
    if (!movie || seen.has(movie.id)) continue;
    seen.add(movie.id);

    items.push({
      id: `radarr-${record.id}`,
      service: "radarr",
      kind: "movie",
      title: movie.title ?? record.sourceTitle ?? "Unknown",
      subtitle: movie.year ? String(movie.year) : "",
      overview: movie.overview ?? "",
      year: movie.year ?? null,
      poster: posterPath("radarr", movie.images),
      addedAt: record.date ?? movie.added ?? new Date().toISOString(),
      runtime: movie.runtime ?? null,
      genres: movie.genres ?? [],
      rating: movie.ratings?.tmdb?.value ?? movie.ratings?.value ?? null,
      seasonNumber: null,
      episodeNumber: null,
      link: cfg && movie.titleSlug ? `${cfg.url}/movie/${movie.titleSlug}` : null,
      quality: record.quality?.quality?.name ?? null,
    });
  }
  return items;
}

async function fetchSonarr(limit: number): Promise<MediaItem[]> {
  const records = await fetchImportHistory("sonarr", limit, {
    includeSeries: "true",
    includeEpisode: "true",
  });

  const cfg = config("sonarr");
  const seen = new Set<string>();
  const items: MediaItem[] = [];

  for (const record of records) {
    const series = record.series;
    const episode = record.episode;
    if (!series || !episode) continue;

    const key = `${series.id}-${episode.seasonNumber}-${episode.episodeNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const code = `S${pad(episode.seasonNumber ?? 0)}E${pad(episode.episodeNumber ?? 0)}`;
    items.push({
      id: `sonarr-${record.id}`,
      service: "sonarr",
      kind: "episode",
      title: series.title ?? "Unknown",
      subtitle: episode.title ? `${code} · ${episode.title}` : code,
      // The episode's own synopsis is the interesting part; fall back to the series blurb.
      overview: episode.overview || series.overview || "",
      year: series.year ?? null,
      poster: posterPath("sonarr", series.images),
      addedAt: record.date ?? new Date().toISOString(),
      runtime: episode.runtime ?? series.runtime ?? null,
      genres: series.genres ?? [],
      rating: series.ratings?.value ?? null,
      seasonNumber: episode.seasonNumber ?? null,
      episodeNumber: episode.episodeNumber ?? null,
      link: cfg && series.titleSlug ? `${cfg.url}/series/${series.titleSlug}` : null,
      quality: record.quality?.quality?.name ?? null,
    });
  }
  return items;
}

let cache: { at: number; snapshot: MediaSnapshot } | null = null;
const CACHE_MS = 60_000;

export async function getRecentMedia(limit = 12, force = false): Promise<MediaSnapshot> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.snapshot;

  const hasSonarr = Boolean(config("sonarr"));
  const hasRadarr = Boolean(config("radarr"));

  if (!hasSonarr && !hasRadarr) {
    const snapshot: MediaSnapshot = { configured: false, items: [], errors: [] };
    cache = { at: Date.now(), snapshot };
    return snapshot;
  }

  const errors: { service: ArrService; message: string }[] = [];
  const results = await Promise.all([
    hasSonarr
      ? fetchSonarr(limit).catch((e) => {
          errors.push({ service: "sonarr", message: e?.message ?? "unreachable" });
          return [] as MediaItem[];
        })
      : Promise.resolve([] as MediaItem[]),
    hasRadarr
      ? fetchRadarr(limit).catch((e) => {
          errors.push({ service: "radarr", message: e?.message ?? "unreachable" });
          return [] as MediaItem[];
        })
      : Promise.resolve([] as MediaItem[]),
  ]);

  const items = results
    .flat()
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
    .slice(0, limit);

  const snapshot: MediaSnapshot = { configured: true, items, errors };
  cache = { at: Date.now(), snapshot };
  return snapshot;
}

export function invalidateMediaCache() {
  cache = null;
}

/**
 * Streams cover art from Sonarr/Radarr so the browser never needs the API key
 * (or internet access). Only MediaCover paths are proxied — anything else would
 * turn this into an open request forwarder.
 */
export async function fetchCover(
  service: ArrService,
  path: string
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  if (!path.startsWith("/MediaCover/")) return null;
  const cfg = config(service);
  if (!cfg) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await lanFetch(`${cfg.url}${path}`, {
      headers: { "X-Api-Key": cfg.apiKey },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return {
      body: await res.arrayBuffer(),
      contentType: res.headers.get("content-type") ?? "image/jpeg",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function testArrConnection(service: ArrService, url: string, apiKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await lanFetch(`${url.replace(/\/+$/, "")}/api/v3/system/status`, {
      headers: { "X-Api-Key": apiKey },
      signal: controller.signal,
    });
    if (res.status === 401) return { ok: false, error: "Invalid API key" };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, version: data?.version, name: data?.instanceName ?? service };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Adding new media
// ---------------------------------------------------------------------------

export interface LookupResult {
  service: ArrService;
  kind: "movie" | "series";
  /** tmdbId for movies, tvdbId for series. */
  externalId: number;
  title: string;
  year: number | null;
  overview: string;
  poster: string | null;
  runtime: number | null;
  genres: string[];
  rating: number | null;
  network: string | null;
  status: string | null;
  /** > 0 when Radarr/Sonarr already track this, so we can stop a duplicate add. */
  existingId: number;
  /** Only set when existingId > 0 — an item that isn't in the library yet has no page to link to. */
  link: string | null;
}

export interface AddOptions {
  rootFolders: { id: number; path: string; freeSpace: number | null }[];
  qualityProfiles: { id: number; name: string }[];
}

function lookupPoster(images: any[] | undefined): string | null {
  if (!Array.isArray(images)) return null;
  const poster = images.find((i) => i?.coverType === "poster") ?? images[0];
  // Lookup hits aren't in the library yet, so there's no local MediaCover path
  // to proxy — the browser loads these straight from TMDB/TheTVDB.
  return poster?.remoteUrl ?? poster?.url ?? null;
}

export async function lookup(service: ArrService, term: string): Promise<LookupResult[]> {
  const path = service === "radarr" ? "/api/v3/movie/lookup" : "/api/v3/series/lookup";
  const results = await callArr(service, path, { term });
  if (!Array.isArray(results)) return [];

  const cfg = config(service);

  return results.slice(0, 20).map((r: any) => {
    const existingId = r.id ?? 0;
    return {
      service,
      kind: service === "radarr" ? ("movie" as const) : ("series" as const),
      externalId: service === "radarr" ? (r.tmdbId ?? 0) : (r.tvdbId ?? 0),
      title: r.title ?? "Unknown",
      year: r.year ?? null,
      overview: r.overview ?? "",
      poster: lookupPoster(r.images),
      runtime: r.runtime ?? null,
      genres: r.genres ?? [],
      rating: r.ratings?.tmdb?.value ?? r.ratings?.value ?? null,
      network: r.network ?? null,
      status: r.status ?? null,
      existingId,
      link:
        existingId > 0 && cfg && r.titleSlug
          ? `${cfg.url}/${service === "radarr" ? "movie" : "series"}/${r.titleSlug}`
          : null,
    };
  });
}

export async function getAddOptions(service: ArrService): Promise<AddOptions> {
  const [rootFolders, qualityProfiles] = await Promise.all([
    callArr(service, "/api/v3/rootfolder"),
    callArr(service, "/api/v3/qualityprofile"),
  ]);
  return {
    rootFolders: (Array.isArray(rootFolders) ? rootFolders : []).map((f: any) => ({
      id: f.id,
      path: f.path,
      freeSpace: typeof f.freeSpace === "number" ? f.freeSpace : null,
    })),
    qualityProfiles: (Array.isArray(qualityProfiles) ? qualityProfiles : []).map((p: any) => ({
      id: p.id,
      name: p.name,
    })),
  };
}

export interface AddRequest {
  service: ArrService;
  externalId: number;
  title: string;
  year?: number | null;
  qualityProfileId: number;
  rootFolderPath: string;
  searchNow: boolean;
  /** Sonarr only: which episodes to monitor. */
  monitor?: "all" | "future" | "firstSeason" | "none";
}

export async function addMedia(req: AddRequest) {
  if (req.service === "radarr") {
    const body = {
      title: req.title,
      tmdbId: req.externalId,
      year: req.year ?? undefined,
      qualityProfileId: req.qualityProfileId,
      rootFolderPath: req.rootFolderPath,
      monitored: true,
      minimumAvailability: "released",
      addOptions: { searchForMovie: req.searchNow },
    };
    const created = await postArr("radarr", "/api/v3/movie", body);
    invalidateMediaCache();
    return { id: created?.id ?? null, title: created?.title ?? req.title };
  }

  const body = {
    title: req.title,
    tvdbId: req.externalId,
    qualityProfileId: req.qualityProfileId,
    rootFolderPath: req.rootFolderPath,
    monitored: true,
    seasonFolder: true,
    addOptions: {
      monitor: req.monitor ?? "all",
      searchForMissingEpisodes: req.searchNow,
      searchForCutoffUnmetEpisodes: false,
    },
  };
  const created = await postArr("sonarr", "/api/v3/series", body);
  invalidateMediaCache();
  return { id: created?.id ?? null, title: created?.title ?? req.title };
}

// ---------------------------------------------------------------------------
// Upcoming episodes (Sonarr calendar)
// ---------------------------------------------------------------------------

export interface UpcomingItem {
  id: string;
  title: string;
  subtitle: string;
  overview: string;
  airsAt: string;
  poster: string | null;
  network: string | null;
  /** Already downloaded, so it can be dimmed rather than treated as pending. */
  hasFile: boolean;
  link: string | null;
}

export interface UpcomingSnapshot {
  configured: boolean;
  items: UpcomingItem[];
  error?: string;
}

export async function getUpcoming(days = 7, limit = 12): Promise<UpcomingSnapshot> {
  const cfg = config("sonarr");
  if (!cfg) return { configured: false, items: [] };

  const start = new Date();
  const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

  try {
    const records = await callArr("sonarr", "/api/v3/calendar", {
      start: start.toISOString(),
      end: end.toISOString(),
      includeSeries: "true",
    });

    const items: UpcomingItem[] = (Array.isArray(records) ? records : [])
      .map((r: any) => {
        const series = r.series ?? {};
        const code = `S${pad(r.seasonNumber ?? 0)}E${pad(r.episodeNumber ?? 0)}`;
        return {
          id: `sonarr-cal-${r.id}`,
          title: series.title ?? "Unknown",
          subtitle: r.title ? `${code} · ${r.title}` : code,
          overview: r.overview || series.overview || "",
          airsAt: r.airDateUtc ?? r.airDate ?? "",
          poster: posterPath("sonarr", series.images),
          network: series.network ?? null,
          hasFile: Boolean(r.hasFile),
          link: series.titleSlug ? `${cfg.url}/series/${series.titleSlug}` : null,
        };
      })
      .filter((i) => i.airsAt)
      .sort((a, b) => new Date(a.airsAt).getTime() - new Date(b.airsAt).getTime())
      .slice(0, limit);

    return { configured: true, items };
  } catch (err) {
    return {
      configured: true,
      items: [],
      error: err instanceof Error ? err.message : "unreachable",
    };
  }
}
