import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { UpcomingItem, UpcomingSnapshot } from "../types";
import { SectionHeading } from "./SectionHeading";

/** "Tonight" / "Tomorrow" / "Thu" — calendar days, not 24h windows. */
function whenLabel(iso: string): string {
  const air = new Date(iso);
  if (Number.isNaN(air.getTime())) return "";

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(air) - startOfDay(new Date())) / 86_400_000);

  if (days <= 0) return "Tonight";
  if (days === 1) return "Tomorrow";
  if (days < 7) return air.toLocaleDateString([], { weekday: "long" });
  return air.toLocaleDateString([], { month: "short", day: "numeric" });
}

function airTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Poster({ item }: { item: UpcomingItem }) {
  const [failed, setFailed] = useState(false);
  if (!item.poster || failed) {
    return (
      <div className="flex h-full w-full items-center justify-center sunken-strong p-2 text-center">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {item.title}
        </span>
      </div>
    );
  }
  return (
    <img
      src={item.poster}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

// Same visual weight as a Recently Added poster card — this used to be a
// compact text list, which read as an afterthought sitting next to that
// section's big poster grid.
function UpcomingCard({ item }: { item: UpcomingItem }) {
  return (
    <motion.a
      href={item.link ?? undefined}
      target="_blank"
      rel="noreferrer"
      whileHover={{ y: -4 }}
      className={`group relative block overflow-hidden rounded-xl ${item.hasFile ? "opacity-60" : ""}`}
      title={item.overview || item.title}
    >
      <div className="aspect-[2/3] w-full overflow-hidden rounded-xl">
        <Poster item={item} />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2.5 pt-8">
        <p className="truncate text-xs font-bold text-white">{item.title}</p>
        <p className="truncate text-[11px] text-white/70">{item.subtitle}</p>
      </div>

      <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
        {airTime(item.airsAt)}
      </span>

      {item.hasFile ? (
        <span className="absolute right-2 top-2 rounded bg-emerald-500/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
          Downloaded
        </span>
      ) : (
        item.network && (
          <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white/80">
            {item.network}
          </span>
        )
      )}
    </motion.a>
  );
}

export function UpcomingSection() {
  const [snapshot, setSnapshot] = useState<UpcomingSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.get<UpcomingSnapshot>("/media/upcoming?days=7");
        if (!cancelled) setSnapshot(data);
      } catch {
        if (!cancelled) setSnapshot({ configured: false, items: [] });
      }
    }
    load();
    const id = setInterval(load, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!snapshot || !snapshot.configured || snapshot.items.length === 0) return null;

  // Group by day so the row reads as a schedule rather than a flat list.
  const groups: { label: string; items: UpcomingItem[] }[] = [];
  for (const item of snapshot.items) {
    const label = whenLabel(item.airsAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <section>
      <SectionHeading major count={snapshot.items.length}>
        Upcoming
      </SectionHeading>

      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-accent">
              {group.label}
            </p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
              {group.items.map((item) => (
                <UpcomingCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
