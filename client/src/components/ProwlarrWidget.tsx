import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ProwlarrSnapshot } from "../types";

function untilLabel(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (!Number.isFinite(mins) || mins <= 0) return "";
  if (mins < 60) return `${mins}m`;
  return `${Math.round(mins / 60)}h`;
}

export function ProwlarrWidget() {
  const [snapshot, setSnapshot] = useState<ProwlarrSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.get<ProwlarrSnapshot>("/prowlarr/status");
        if (!cancelled) setSnapshot(data);
      } catch {
        /* leave the widget hidden */
      }
    }
    load();
    // Indexer status doesn't change fast — a REST poll is plenty, no socket needed.
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!snapshot || !snapshot.configured) return null;

  const blocked = snapshot.indexers.filter((i) => i.enabled && i.blocked);
  const allHealthy = snapshot.enabled > 0 && blocked.length === 0;

  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          ⌕
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight text-ink">Indexers</h2>
          <p className="truncate text-xs text-ink-muted">
            {!snapshot.reachable
              ? "Cannot reach Prowlarr"
              : `${snapshot.healthy} / ${snapshot.enabled} healthy`}
          </p>
        </div>
        {snapshot.reachable && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{
              backgroundColor: allHealthy ? "#34d39926" : "#f8717126",
              color: allHealthy ? "#34d399" : "#f87171",
            }}
          >
            {allHealthy ? "All good" : `${blocked.length} down`}
          </span>
        )}
      </div>

      {!snapshot.reachable ? (
        <p className="rounded-xl bg-red-500/10 px-3.5 py-3 text-xs text-red-300">
          {snapshot.error ?? "Prowlarr is unreachable"} — check the URL and API key in Settings.
        </p>
      ) : blocked.length === 0 ? (
        <p className="py-3 text-center text-sm text-ink-muted">
          {snapshot.enabled === 0 ? "No indexers enabled" : "All indexers responding"}
        </p>
      ) : (
        <ul className="scrollbar-thin flex max-h-[184px] flex-col gap-1.5 overflow-y-auto">
          {blocked.map((idx) => {
            const until = untilLabel(idx.disabledTill);
            return (
              <li
                key={idx.id}
                className="flex items-center gap-2 rounded-xl sunken px-3 py-2 text-xs"
                title={idx.failureReason ?? undefined}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{idx.name}</span>
                {until && <span className="shrink-0 text-ink-muted">back in {until}</span>}
              </li>
            );
          })}
        </ul>
      )}

      {snapshot.issues.length > 0 && (
        <div className="mt-3 hairline border-t pt-2.5">
          {snapshot.issues.slice(0, 3).map((issue, i) => (
            <p
              key={i}
              className={`truncate text-[11px] ${
                issue.type === "error" ? "text-red-400" : "text-amber-400"
              }`}
              title={issue.message}
            >
              {issue.message}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
