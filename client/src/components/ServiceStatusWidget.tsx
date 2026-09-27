import { useStore } from "../store/useStore";

const DOT_COLOR: Record<string, string> = {
  up: "#34d399",
  down: "#f87171",
  unknown: "#94a3b8",
};

export function ServiceStatusWidget() {
  const items = useStore((s) => s.items);
  const health = useStore((s) => s.health);

  const tracked = items
    .filter((i) => i.type === "app" || Boolean(i.is_pinned))
    .filter((i) => health[i.id])
    .sort((a, b) => a.name.localeCompare(b.name));

  if (tracked.length === 0) return null;

  const upCount = tracked.filter((i) => health[i.id]?.state === "up").length;

  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
          ♥
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight text-ink">Service status</h2>
          <p className="truncate text-xs text-ink-muted">
            {upCount} / {tracked.length} reachable
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {tracked.map((item) => (
          <div key={item.id} className="flex min-w-0 items-center gap-2 py-0.5 text-xs">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: DOT_COLOR[health[item.id]?.state ?? "unknown"] }}
            />
            <span className="truncate text-ink-muted">{item.name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
