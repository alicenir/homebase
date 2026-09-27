import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { UptimeInfo } from "../types";
import { Sparkline } from "./Sparkline";

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

  return (
    <section className="glass flex flex-col rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          ⏱
        </div>
        <h2 className="text-base font-semibold leading-tight text-ink">Homebase uptime</h2>
      </div>

      <p className="text-2xl font-extrabold text-ink">{formatUptime(info.processUptimeSeconds)}</p>
      <p className="mb-2 text-xs text-ink-muted">since last restart</p>

      <div className="mt-auto">
        <Sparkline values={info.history.map((h) => h.fractionUp * 100)} color="#34d399" />
        <p className="mt-1 text-[10px] text-ink-muted">Apps reachable, recent history</p>
      </div>
    </section>
  );
}
