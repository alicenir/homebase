import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { UptimeInfo } from "../types";
import { Sparkline } from "./Sparkline";
import { Gauge } from "./Gauge";

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function UptimeWidget() {
  const [info, setInfo] = useState<UptimeInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.get<UptimeInfo>("/health-checks/uptime");
        if (!cancelled) setInfo(data);
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

  if (!info) return null;

  const history = info.history.map((h) => h.fractionUp * 100);
  const currentPct = history.length > 0 ? history[history.length - 1] : 100;
  const avgPct = history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : 100;

  return (
    <section className="glass flex flex-col rounded-2xl p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          ⏱
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight text-ink">Homebase uptime</h2>
          <p className="truncate text-xs text-ink-muted">{formatUptime(info.processUptimeSeconds)} since last restart</p>
        </div>
      </div>

      <div className="flex flex-1 items-center gap-5">
        <Gauge value={currentPct} label="Reachable" sublabel="apps now" color="#34d399" size={80} />

        <div className="min-w-0 flex-1 self-stretch">
          <div className="mb-1.5 flex items-baseline justify-between">
            <p className="text-[11px] font-semibold text-ink-muted">Reachability history</p>
            <p className="text-[11px] font-semibold text-ink">{Math.round(avgPct)}% avg</p>
          </div>
          <Sparkline values={history} height={48} color="#34d399" responsive />
        </div>
      </div>
    </section>
  );
}
