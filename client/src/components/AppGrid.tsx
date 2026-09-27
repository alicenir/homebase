import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import type { Item } from "../types";
import { AppCard } from "./AppCard";

// A real CSS grid (not flex+basis) so every tile shares the same column
// tracks: a trailing row that doesn't fill every column (11 apps in a
// 4-column grid, say) leaves a gap on the right instead of one tile
// stretching to fill it, with no extra markup needed to get that for free.
const TILE_GRID = "grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2 sm:gap-2.5";

interface Props {
  items: Item[];
  accent?: string;
  onEdit: (item: Item) => void;
  onAddClick?: () => void;
}

export function AppGrid({ items, accent, onEdit, onAddClick }: Props) {
  const editMode = useStore((s) => s.editMode);
  const upsertItem = useStore((s) => s.upsertItem);
  const removeItem = useStore((s) => s.removeItem);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function handleDelete(item: Item) {
    if (!confirm(`Remove "${item.name}"?`)) return;
    await api.delete(`/items/${item.id}`);
    removeItem(item.id);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex).map((item, index) => ({
      ...item,
      sort_order: index,
    }));
    reordered.forEach((item) => upsertItem(item));
    await api.post("/items/reorder", {
      items: reordered.map((item) => ({ id: item.id, sort_order: item.sort_order })),
    });
  }

  if (items.length === 0 && !editMode) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div className={TILE_GRID}>
          {items.map((item) => (
            <AppCard
              key={item.id}
              item={item}
              accent={accent}
              editMode={editMode}
              onEdit={onEdit}
              onDelete={handleDelete}
            />
          ))}
          {editMode && onAddClick && (
            <button
              onClick={onAddClick}
              className="hairline aspect-square flex flex-col items-center justify-center gap-2 self-start rounded-xl border border-dashed p-3.5 text-ink-muted transition-colors hover:border-accent/60 hover:text-accent"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg sunken text-xl">
                +
              </span>
              <span className="text-sm font-bold">Add</span>
            </button>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}
