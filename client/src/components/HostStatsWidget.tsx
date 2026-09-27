import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { HostStats } from "../types";
import { Gauge } from "./Gauge";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 GB";
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

export function HostStatsWidget() {
  const [stats, setStats] = useState<HostStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.get<HostStats>("/portainer/hoststats");
        if (!cancelled) setStats(data);
      } catch {
        /* leave the widget hidden */
      }
    }
    load();
    const id = setInterval(load, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!stats || !stats.configured) return null;

  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          ⚙
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight text-ink">Docker host</h2>
          <p className="truncate text-xs text-ink-muted">
            {!stats.reachable
              ? "Cannot reach Portainer"
              : `${stats.cpuCores} cores · ${stats.runningCount}/${stats.containerCount} containers${
                  stats.endpointName ? ` · ${stats.endpointName}` : ""
                }`}
          </p>
        </div>
      </div>

      {!stats.reachable ? (
        <p className="rounded-xl bg-red-500/10 px-3.5 py-3 text-xs text-red-300">
          {stats.error ?? "Portainer is unreachable"}
        </p>
      ) : (
        <div className="flex items-start justify-around gap-2">
          <Gauge value={stats.cpuPercent} label="CPU" color="#38bdf8" />
          <Gauge value={stats.memPercent} label="Memory" color="#a78bfa" />
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full sunken">
              <span className="text-sm font-bold text-ink">
                {stats.diskUsedBytes != null ? formatBytes(stats.diskUsedBytes) : "—"}
              </span>
            </div>
            <p className="text-[11px] font-semibold text-ink-muted">Disk</p>
          </div>
        </div>
      )}
    </section>
  );
}
