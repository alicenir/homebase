import { useEffect, useState } from "react";
import { AddMediaModal } from "./components/AddMediaModal";
import { AppGrid } from "./components/AppGrid";
import { AssistantChat } from "./components/AssistantChat";
import { HostStatsWidget } from "./components/HostStatsWidget";
import { NowPlayingWidget } from "./components/NowPlayingWidget";
import { PortainerWidget } from "./components/PortainerWidget";
import { ProwlarrWidget } from "./components/ProwlarrWidget";
import { ServiceStatusWidget } from "./components/ServiceStatusWidget";
import { SideRail } from "./components/SideRail";
import { UpcomingSection } from "./components/UpcomingSection";
import { UptimeWidget } from "./components/UptimeWidget";
import { WeatherWidget } from "./components/WeatherWidget";
import { BookmarksSection } from "./components/BookmarksSection";
import { CommandPalette } from "./components/CommandPalette";
import { Header } from "./components/Header";
import { ItemModal } from "./components/ItemModal";
import { LoginModal } from "./components/LoginModal";
import { MediaSection } from "./components/MediaSection";
import { SabnzbdWidget } from "./components/SabnzbdWidget";
import { SectionHeading } from "./components/SectionHeading";
import { SettingsPanel } from "./components/SettingsPanel";
import { TeslaWidget } from "./components/TeslaWidget";
import { socket } from "./lib/socket";
import { useStore } from "./store/useStore";
import type { Item, ItemType } from "./types";

export default function App() {
  const { loadAll, items, settings, loading } = useStore();
  const editMode = useStore((s) => s.editMode);
  const addMediaOpen = useStore((s) => s.addMediaOpen);
  const setAddMediaOpen = useStore((s) => s.setAddMediaOpen);
  const bumpMediaRefresh = useStore((s) => s.bumpMediaRefresh);
  const setHealth = useStore((s) => s.setHealth);

  const [query, setQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"General" | "Media" | "Car">("General");
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [newItemDefaults, setNewItemDefaults] = useState<{ type: ItemType; categoryId: number | null }>({
    type: "app",
    categoryId: null,
  });
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.classList.toggle("light", settings.theme === "light");
    document.documentElement.style.setProperty("--accent", settings.accent_color);

    const bg = settings.background_image_url?.trim();
    if (bg) {
      // JSON.stringify quotes and escapes the URL safely for use inside url(...)
      // — this is a background-image, not markup, so there's no injection risk,
      // just malformed CSS if a raw quote in the URL weren't escaped.
      document.body.style.setProperty("--bg-photo", `url(${JSON.stringify(bg)})`);
      document.body.setAttribute("data-bg-photo", "true");
    } else {
      document.body.removeAttribute("data-bg-photo");
      document.body.style.removeProperty("--bg-photo");
    }
  }, [settings]);

  useEffect(() => {
    function onHealth(next: Record<number, any>) {
      setHealth(next);
    }
    socket.on("health:update", onHealth);
    return () => {
      socket.off("health:update", onHealth);
    };
  }, [setHealth]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function openAddModal(type: ItemType, categoryId: number | null = null) {
    setEditingItem(null);
    setNewItemDefaults({ type, categoryId });
    setItemModalOpen(true);
  }

  function openEditModal(item: Item) {
    setEditingItem(item);
    setItemModalOpen(true);
  }

  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  const apps = filtered
    .filter((i) => i.type === "app" || Boolean(i.is_pinned))
    .sort((a, b) => a.sort_order - b.sort_order);
  const bookmarks = filtered
    .filter((i) => i.type === "bookmark" && !i.is_pinned)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="shimmer h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1800px] gap-6 px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
      <SideRail
        onOpenSettings={() => {
          setSettingsTab("General");
          setSettingsOpen(true);
        }}
        onOpenLogin={() => setLoginOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-10">
        <Header
          query={query}
          onQueryChange={setQuery}
          onOpenSettings={() => {
            setSettingsTab("General");
            setSettingsOpen(true);
          }}
          onOpenLogin={() => setLoginOpen(true)}
          onAskAssistant={(question) => {
            setAssistantQuestion(question);
            setAssistantOpen(true);
          }}
        />

        <main className="flex min-w-0 flex-1 flex-col gap-10">
          {(apps.length > 0 || editMode) && (
            <section id="apps-section">
              <SectionHeading major count={apps.length}>
                Applications
              </SectionHeading>
              <AppGrid items={apps} onEdit={openEditModal} onAddClick={() => openAddModal("app")} />
            </section>
          )}

          {/* Live status first. auto-fit keeps the row filled no matter how many
              of these are configured, and empty:hidden avoids a stray gap when
              none of them are. Cards in a row stretch to match the tallest one
              (default grid behavior) so a row reads as a consistent set of
              tiles rather than a staggered mix of heights. */}
          <section id="status-row" className="scroll-mt-6">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6 empty:hidden">
              <SabnzbdWidget />
              <NowPlayingWidget />
              <TeslaWidget />
              <WeatherWidget />
              <ProwlarrWidget />
            </div>
            {/* Infrastructure widgets grouped together, separately from the
                activity ones above — Containers belongs with Docker host,
                not with downloads/media/car/weather. */}
            <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6 empty:hidden">
              <PortainerWidget />
              <HostStatsWidget />
              <ServiceStatusWidget />
              <UptimeWidget />
            </div>
          </section>

          <div id="media-section">
            <MediaSection
              onConfigure={() => {
                setSettingsTab("Media");
                setSettingsOpen(true);
              }}
            />
          </div>

          <UpcomingSection />

          <BookmarksSection
            bookmarks={bookmarks}
            onEdit={openEditModal}
            onAddClick={(categoryId) => openAddModal("bookmark", categoryId)}
          />

          {apps.length === 0 && bookmarks.length === 0 && !editMode && (
            <div className="glass flex flex-col items-center gap-3 rounded-2xl py-16 text-center">
              <p className="text-lg font-semibold text-ink">Nothing here yet</p>
              <p className="max-w-sm text-sm text-ink-muted">
                {q
                  ? "No apps or bookmarks match your search."
                  : "Hit Edit to add your first app or bookmark."}
              </p>
            </div>
          )}
        </main>
      </div>

      <AddMediaModal
        open={addMediaOpen}
        onClose={() => setAddMediaOpen(false)}
        onAdded={bumpMediaRefresh}
      />
      <CommandPalette items={items} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsTab}
        onRequestLogin={() => setLoginOpen(true)}
      />
      <ItemModal
        open={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        editing={editingItem}
        defaultType={newItemDefaults.type}
        defaultCategoryId={newItemDefaults.categoryId}
      />
      <AssistantChat
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        onRequestLogin={() => setLoginOpen(true)}
        pendingQuestion={assistantQuestion}
        onConsumePendingQuestion={() => setAssistantQuestion(null)}
      />
    </div>
  );
}
