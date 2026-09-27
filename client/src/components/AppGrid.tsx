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

// flex-basis as a plain percentage doesn't account for the row's own gaps, so
// the browser's line-breaking (which uses each item's *un-shrunk* basis, not
// what it'll actually render at) silently wraps one item early per row —
// e.g. 4 cards at a flat 25% plus 3 gaps overflow the row by the gap width,
// so only 3 land on each line and grow stretches those 3, not 4. Baking the
// gap into the basis with calc() keeps the intended column count exact.
const TILE_BASIS =
  "basis-[calc(50%-0.25rem)] sm:basis-[calc(50%-0.3125rem)] lg:basis-[calc(33.3333%-0.41667rem)] 2xl:basis-[calc(25%-0.46875rem)]";

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
        {/* flex + basis instead of a plain grid: a trailing row that doesn't
            fill every column (11 apps in a 4-column grid, say) leaves a gap
            on the right rather than stretching one card to fill it — every
            tile stays the same size regardless of row position. */}
        <div className="flex flex-wrap gap-2 sm:gap-2.5">
          {items.map((item) => (
            <AppCard
              key={item.id}
              item={item}
              accent={accent}
              editMode={editMode}
              onEdit={onEdit}
              onDelete={handleDelete}
              className={`grow-0 ${TILE_BASIS}`}
            />
          ))}
          {editMode && onAddClick && (
            <button
              onClick={onAddClick}
              className={`hairline shrink-0 grow-0 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-3.5 text-ink-muted transition-colors hover:border-accent/60 hover:text-accent ${TILE_BASIS}`}
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
