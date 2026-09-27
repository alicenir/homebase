import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { NasSnapshot } from "../types";
import { Gauge } from "./Gauge";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 GB";
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function pct(used: number, total: number): number | null {
  return total > 0 ? Math.min((used / total) * 100, 100) : null;
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
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-around gap-2">
            <Gauge value={snapshot.cpuLoadPercent} label="CPU" color="#38bdf8" />
            <Gauge value={memPercent} label="Memory" color="#a78bfa" />
          </div>

          {snapshot.volumes.length > 0 && (
            <ul className="flex flex-col gap-2">
              {snapshot.volumes.map((v) => {
                const usedPct = pct(v.usedBytes, v.totalBytes);
                return (
                  <li key={v.name} className="text-xs">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="min-w-0 truncate font-medium text-ink">{v.name}</span>
                      <span className="shrink-0 text-ink-muted">
                        {formatBytes(v.usedBytes)} / {formatBytes(v.totalBytes)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full sunken-strong">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${usedPct ?? 0}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
