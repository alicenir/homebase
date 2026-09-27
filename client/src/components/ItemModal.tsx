import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import type { Item, ItemType } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  editing: Item | null;
  defaultType: ItemType;
  defaultCategoryId: number | null;
}

const empty = {
  name: "",
  url: "",
  icon: "",
  description: "",
  category_id: null as number | null,
};

export function ItemModal({ open, onClose, editing, defaultType, defaultCategoryId }: Props) {
  const categories = useStore((s) => s.categories);
  const upsertItem = useStore((s) => s.upsertItem);
  const [type, setType] = useState<ItemType>(defaultType);
  const [form, setForm] = useState(empty);
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setType(editing.type);
      setForm({
        name: editing.name,
        url: editing.url,
        icon: editing.icon ?? "",
        description: editing.description ?? "",
        category_id: editing.category_id,
      });
      setPinned(Boolean(editing.is_pinned));
    } else {
      setType(defaultType);
      setForm({ ...empty, category_id: defaultCategoryId });
      setPinned(defaultType === "app");
    }
  }, [editing, open, defaultType, defaultCategoryId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.url.trim()) return;
    setSaving(true);
    const url = form.url.startsWith("http") ? form.url : `https://${form.url}`;
    const payload = {
      type,
      name: form.name.trim(),
      url,
      icon: form.icon.trim() || null,
      description: form.description.trim() || null,
      category_id: type === "bookmark" ? form.category_id : null,
      is_pinned: pinned,
    };
    const is_pinned: 0 | 1 = pinned ? 1 : 0;
    try {
      if (editing) {
        await api.put(`/items/${editing.id}`, payload);
        upsertItem({ ...editing, ...payload, is_pinned });
        toast.success("Updated");
      } else {
        const { id } = await api.post<{ id: number }>("/items", payload);
        upsertItem({ ...payload, id, sort_order: 999, is_pinned });
        toast.success("Added");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={onClose}
        >
          <motion.form
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            className="glass w-full max-w-md rounded-2xl p-6"
          >
            <h2 className="mb-4 text-lg font-semibold">{editing ? "Edit" : "Add"} link</h2>

            <div className="mb-3 flex gap-2 rounded-xl sunken p-1">
              {(["app", "bookmark"] as ItemType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 rounded-lg py-1.5 text-sm capitalize transition-colors ${
                    type === t ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-3">
              <input
                autoFocus
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Name"
                className="field"
              />
              <input
                required
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="URL (e.g. https://sonarr.local)"
                className="field"
              />
              <input
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                placeholder="Icon: emoji, image URL, or simple-icons slug (e.g. plex)"
                className="field"
              />
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Subtitle (optional, e.g. Media streaming)"
                className="field"
              />

              {type === "bookmark" && (
                <select
                  value={form.category_id ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category_id: e.target.value ? Number(e.target.value) : null }))
                  }
                  className="field"
                >
                  <option value="">No category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}

              <label className="flex items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="rounded hairline sunken accent-accent"
                />
                Pin to top
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-primary"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
