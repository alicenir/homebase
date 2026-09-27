import { getSetting } from "../db.js";
import { lanFetch } from "../lib/lanFetch.js";

export interface ContainerStatus {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  stack: string | null;
}

export interface PortainerSnapshot {
  configured: boolean;
  reachable: boolean;
  error?: string;
  total: number;
  running: number;
  /** Anything not "running" — exited, restarting, dead, paused, created. */
  problem: ContainerStatus[];
}

export interface PortainerEndpoint {
  id: number;
  name: string;
  status: "up" | "down";
}

function config(): { url: string; apiKey: string; endpointId: string } | null {
  const url = getSetting("portainer_url");
  const apiKey = getSetting("portainer_api_key");
  if (!url || !apiKey) return null;
  return {
    url: url.replace(/\/+$/, ""),
    apiKey,
    endpointId: getSetting("portainer_endpoint_id") || "1",
  };
}

async function call(path: string, override?: { url: string; apiKey: string }) {
  const cfg = override ?? config();
  if (!cfg) throw new Error("not_configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await lanFetch(`${cfg.url}${path}`, {
      headers: { "X-Api-Key": cfg.apiKey },
      signal: controller.signal,
    });
    if (res.status === 401) throw new Error("Invalid API key");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

function empty(configured: boolean, error?: string): PortainerSnapshot {
  return { configured, reachable: false, error, total: 0, running: 0, problem: [] };
}

export async function getStatus(): Promise<PortainerSnapshot> {
  const cfg = config();
  if (!cfg) return empty(false);

  try {
    // Portainer proxies the Docker Engine API directly under this path, so
    // this is live container state from the daemon — not a cached snapshot.
    const containers = await call(
      `/api/endpoints/${cfg.endpointId}/docker/containers/json?all=true`
    );

    const list: ContainerStatus[] = (Array.isArray(containers) ? containers : []).map((c: any) => ({
      id: c.Id,
      name: (c.Names?.[0] ?? "").replace(/^\//, "") || c.Id?.slice(0, 12) || "unknown",
      image: c.Image ?? "",
      state: c.State ?? "unknown",
      status: c.Status ?? "",
      stack: c.Labels?.["com.docker.compose.project"] ?? null,
    }));

    return {
      configured: true,
      reachable: true,
      total: list.length,
      running: list.filter((c) => c.state === "running").length,
      problem: list
        .filter((c) => c.state !== "running")
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  } catch (err) {
    return empty(true, err instanceof Error ? err.message : "unreachable");
  }
}

export interface HostStats {
  configured: boolean;
  reachable: boolean;
  error?: string;
  endpointName: string | null;
  cpuCores: number;
  cpuPercent: number | null;
  memTotalBytes: number;
  memUsedBytes: number | null;
  memPercent: number | null;
  diskUsedBytes: number | null;
  containerCount: number;
  runningCount: number;
}

function emptyHostStats(configured: boolean, error?: string): HostStats {
  return {
    configured,
    reachable: false,
    error,
    endpointName: null,
    cpuCores: 0,
    cpuPercent: null,
    memTotalBytes: 0,
    memUsedBytes: null,
    memPercent: null,
    diskUsedBytes: null,
    containerCount: 0,
    runningCount: 0,
  };
}

/** One container's /stats?stream=false snapshot, just the fields we use. */
async function containerStats(
  cfg: { url: string; apiKey: string },
  endpointId: string,
  id: string
): Promise<{ cpuPercent: number; memBytes: number } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await lanFetch(
      `${cfg.url}/api/endpoints/${endpointId}/docker/containers/${id}/stats?stream=false`,
      { headers: { "X-Api-Key": cfg.apiKey }, signal: controller.signal }
    );
    if (!res.ok) return null;
    const s: any = await res.json();

    const cpuDelta = (s.cpu_stats?.cpu_usage?.total_usage ?? 0) - (s.precpu_stats?.cpu_usage?.total_usage ?? 0);
    const systemDelta = (s.cpu_stats?.system_cpu_usage ?? 0) - (s.precpu_stats?.system_cpu_usage ?? 0);
    const onlineCpus =
      s.cpu_stats?.online_cpus ?? s.cpu_stats?.cpu_usage?.percpu_usage?.length ?? 1;
    // Standard `docker stats` formula — percent of a single core, scaled by core count.
    const cpuPercent = systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * onlineCpus * 100 : 0;

    // Match `docker stats`: exclude page cache from the "used" figure so it
    // doesn't look like memory pressure that isn't really there.
    const cache = s.memory_stats?.stats?.cache ?? s.memory_stats?.stats?.inactive_file ?? 0;
    const memBytes = Math.max((s.memory_stats?.usage ?? 0) - cache, 0);

    return { cpuPercent, memBytes };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// A NAS can easily run 40-50+ containers (Portainer's own dashboard is where
// that number comes from) — capped so a poll cycle can't balloon into
// hundreds of concurrent stats requests against the Portainer proxy.
const MAX_STATS_CONTAINERS = 60;

export async function getHostStats(): Promise<HostStats> {
  const cfg = config();
  if (!cfg) return emptyHostStats(false);

  try {
    const [info, containers, df, endpoints] = await Promise.all([
      call(`/api/endpoints/${cfg.endpointId}/docker/info`),
      call(`/api/endpoints/${cfg.endpointId}/docker/containers/json?all=true`),
      call(`/api/endpoints/${cfg.endpointId}/docker/system/df`).catch(() => null),
      call("/api/endpoints").catch(() => null),
    ]);

    const list = Array.isArray(containers) ? containers : [];
    const running: string[] = list
      .filter((c: any) => c.State === "running")
      .map((c: any) => c.Id)
      .slice(0, MAX_STATS_CONTAINERS);

    const stats = (
      await Promise.all(running.map((id) => containerStats(cfg, cfg.endpointId, id)))
    ).filter((s): s is { cpuPercent: number; memBytes: number } => s !== null);

    const cpuCores: number = info?.NCPU ?? 0;
    const memTotalBytes: number = info?.MemTotal ?? 0;
    const totalCpuPercent = stats.reduce((sum, s) => sum + s.cpuPercent, 0);
    const totalMemBytes = stats.reduce((sum, s) => sum + s.memBytes, 0);

    let diskUsedBytes: number | null = null;
    if (df && typeof df === "object") {
      const images = Array.isArray(df.Images)
        ? df.Images.reduce((sum: number, i: any) => sum + (i.Size ?? 0), 0)
        : 0;
      const containersSize = Array.isArray(df.Containers)
        ? df.Containers.reduce((sum: number, c: any) => sum + (c.SizeRootFs ?? c.SizeRw ?? 0), 0)
        : 0;
      const volumes = Array.isArray(df.Volumes)
        ? df.Volumes.reduce((sum: number, v: any) => sum + (v.UsageData?.Size ?? 0), 0)
        : 0;
      diskUsedBytes = images + containersSize + volumes;
    }

    const endpointName = Array.isArray(endpoints)
      ? endpoints.find((e: any) => String(e.Id) === cfg.endpointId)?.Name ?? null
      : null;

    return {
      configured: true,
      reachable: true,
      endpointName,
      cpuCores,
      cpuPercent: cpuCores > 0 ? Math.min(totalCpuPercent / (cpuCores * 100), 1) * 100 : null,
      memTotalBytes,
      memUsedBytes: totalMemBytes,
      memPercent: memTotalBytes > 0 ? Math.min(totalMemBytes / memTotalBytes, 1) * 100 : null,
      diskUsedBytes,
      containerCount: list.length,
      runningCount: running.length,
    };
  } catch (err) {
    return emptyHostStats(true, err instanceof Error ? err.message : "unreachable");
  }
}

export async function listEndpoints(
  url: string,
  apiKey: string
): Promise<{ ok: boolean; error?: string; endpoints?: PortainerEndpoint[] }> {
  try {
    const data = await call("/api/endpoints", { url: url.replace(/\/+$/, ""), apiKey });
    if (!Array.isArray(data)) return { ok: false, error: "Unexpected response" };
    return {
      ok: true,
      endpoints: data.map((e: any) => ({
        id: e.Id,
        name: e.Name ?? `Endpoint ${e.Id}`,
        status: e.Status === 1 ? "up" : "down",
      })),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unreachable" };
  }
}
