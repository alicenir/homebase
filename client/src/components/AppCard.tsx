import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { useStore } from "../store/useStore";
import type { Item } from "../types";
import { Icon } from "./Icon";

interface Props {
  item: Item;
  editMode: boolean;
  accent?: string;
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => void;
}

const DOT: Record<string, { color: string; label: string; text: string }> = {
  up: { color: "#34d399", label: "Reachable", text: "Online" },
  down: { color: "#f87171", label: "Not responding", text: "Offline" },
  unknown: { color: "#94a3b8", label: "Not checked yet", text: "Unknown" },
};

// A small fixed palette so each app's icon badge reads as its own color
// instead of one flat shared accent across every tile — deterministic per
// item id so it stays put across reloads and reorders, not random.
const TILE_COLORS = ["#8b5cf6", "#3b82f6", "#f43f5e", "#64748b", "#a855f7", "#22c55e", "#0ea5e9", "#0f172a"];

function tileColor(id: number): string {
  return TILE_COLORS[id % TILE_COLORS.length];
}

function sinceLabel(since: string | null): string {
  if (!since) return "";
  const mins = Math.round((Date.now() - new Date(since).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

export function AppCard({ item, editMode, accent, onEdit, onDelete }: Props) {
  const health = useStore((s) => s.health[item.id]);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !editMode,
  });

  const badgeColor = accent ?? tileColor(item.id);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  } as React.CSSProperties;

  return (
    <motion.div ref={setNodeRef} style={style} {...attributes} {...listeners} whileHover={{ y: -2 }} className="group relative">
      <a
        href={editMode ? undefined : item.url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => editMode && e.preventDefault()}
        className="glass flex h-full flex-col gap-3 rounded-2xl p-4 transition-colors hover:border-white/20"
      >
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl"
          style={{ backgroundColor: `color-mix(in srgb, ${badgeColor} 22%, transparent)` }}
        >
          <Icon icon={item.icon} name={item.name} className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{item.name}</p>
          {item.description && <p className="truncate text-xs text-ink-muted">{item.description}</p>}
        </div>
        {health && health.state !== "unknown" && (
          <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: DOT[health.state].color }}
              aria-hidden
            />
            <span
              title={`${DOT[health.state].label}${
                health.status ? ` (HTTP ${health.status})` : ""
              }${health.since ? ` · ${sinceLabel(health.since)}` : ""}`}
            >
              {DOT[health.state].text}
            </span>
          </div>
        )}
      </a>

      {editMode && (
        <div className="absolute -right-1.5 -top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => onEdit(item)}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-raised text-xs text-ink shadow hover:bg-accent"
            title="Edit"
          >
            ✎
          </button>
          <button
            onClick={() => onDelete(item)}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-raised text-xs text-ink shadow hover:bg-red-500"
            title="Delete"
          >
            ×
          </button>
        </div>
      )}
    </motion.div>
  );
}
