import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { PortainerSnapshot } from "../types";

const STATE_COLOR: Record<string, string> = {
  exited: "#f87171",
  dead: "#f87171",
  restarting: "#f5c518",
  paused: "#94a3b8",
  created: "#94a3b8",
};

export function PortainerWidget() {
  const [snapshot, setSnapshot] = useState<PortainerSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.get<PortainerSnapshot>("/portainer/status");
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

  const allUp = snapshot.reachable && snapshot.problem.length === 0;

  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          ▣
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight text-ink">Containers</h2>
          <p className="truncate text-xs text-ink-muted">
            {!snapshot.reachable
              ? "Cannot reach Portainer"
              : `${snapshot.running} / ${snapshot.total} running`}
          </p>
        </div>
        {snapshot.reachable && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{
              backgroundColor: allUp ? "#34d39926" : "#f8717126",
              color: allUp ? "#34d399" : "#f87171",
            }}
          >
            {allUp ? "All up" : `${snapshot.problem.length} down`}
          </span>
        )}
      </div>

      {!snapshot.reachable ? (
        <p className="rounded-xl bg-red-500/10 px-3.5 py-3 text-xs text-red-300">
          {snapshot.error ?? "Portainer is unreachable"} — check the URL, API key and environment in
          Settings.
        </p>
      ) : snapshot.problem.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-muted">Every container is running</p>
      ) : (
        <ul className="scrollbar-thin flex max-h-[184px] flex-col gap-1.5 overflow-y-auto">
          {snapshot.problem.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-xl sunken px-3 py-2 text-xs"
              title={c.image}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: STATE_COLOR[c.state] ?? "#94a3b8" }}
              />
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{c.name}</span>
              <span className="shrink-0 capitalize text-ink-muted">{c.state}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
