import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { NasSnapshot, NasVolume } from "../types";
import { Gauge } from "./Gauge";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 GB";
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function pct(used: number, total: number): number | null {
  return total > 0 ? Math.min((used / total) * 100, 100) : null;
}

function barColor(usedPct: number | null): string {
  if (usedPct == null) return "#64748b";
  if (usedPct >= 90) return "#f87171";
  if (usedPct >= 75) return "#fbbf24";
  return "#34d399";
}

// NAS OSes commonly bind-mount one physical volume at several share paths
// (e.g. /share/Media, /share/Music, /share/Plex all backed by the same
// disk) — hrStorageTable reports every mount point as its own row, so
// without collapsing them a single volume shows up a dozen times. Byte-
// identical total/used is a reliable signal they're the same device; the
// shortest path is kept as the representative name (closer to the raw
// mount, e.g. "/volume1" over "/share/Media").
function dedupeVolumes(volumes: NasVolume[]): NasVolume[] {
  const bySize = new Map<string, NasVolume>();
  for (const v of volumes) {
    const key = `${v.totalBytes}:${v.usedBytes}`;
    const existing = bySize.get(key);
    if (!existing || v.name.length < existing.name.length) bySize.set(key, v);
  }
  return [...bySize.values()];
}

export function NasWidget() {
  const [snapshot, setSnapshot] = useState<NasSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.get<NasSnapshot>("/nas/status");
        if (!cancelled) setSnapshot(data);
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

  if (!snapshot || !snapshot.configured) return null;

  const memPercent = snapshot.memTotalBytes && snapshot.memUsedBytes != null
    ? pct(snapshot.memUsedBytes, snapshot.memTotalBytes)
    : null;
  const volumes = dedupeVolumes(snapshot.volumes);

  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          🖴
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight text-ink">NAS</h2>
          <p className="truncate text-xs text-ink-muted">
            {!snapshot.reachable
              ? "Cannot reach NAS via SNMP"
              : snapshot.sysDescr ?? "Connected"}
          </p>
        </div>
      </div>

      {!snapshot.reachable ? (
        <p className="rounded-xl bg-red-500/10 px-3.5 py-3 text-xs text-red-300">
          {snapshot.error ?? "The NAS is unreachable"} — check the host and SNMPv3 credentials in
          Settings.
        </p>
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="flex shrink-0 justify-center gap-6 sm:flex-col sm:items-center sm:justify-start">
            <Gauge value={snapshot.cpuLoadPercent} label="CPU" color="#38bdf8" />
            <Gauge value={memPercent} label="Memory" color="#a78bfa" />
          </div>

          {volumes.length > 0 && (
            <div className="min-w-0 flex-1 sm:border-l sm:border-white/10 sm:pl-5">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
                {volumes.map((v) => {
                  const usedPct = pct(v.usedBytes, v.totalBytes);
                  const color = barColor(usedPct);
                  return (
                    <div key={v.name} className="sunken rounded-xl p-3">
                      <p className="mb-2 truncate text-xs font-semibold text-ink" title={v.name}>
                        {v.name}
                      </p>
                      <div className="h-2 w-full overflow-hidden rounded-full sunken-strong">
                        <div
                          className="h-full rounded-full transition-[width] duration-500"
                          style={{ width: `${usedPct ?? 0}%`, backgroundColor: color }}
                        />
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[11px]">
                        <span className="font-bold" style={{ color }}>
                          {usedPct != null ? `${Math.round(usedPct)}%` : "—"}
                        </span>
                        <span className="text-ink-muted">
                          {formatBytes(v.usedBytes)} / {formatBytes(v.totalBytes)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
