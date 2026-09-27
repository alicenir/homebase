import { useStore } from "../store/useStore";
import { Greeting } from "./Clock";
import { SearchBar } from "./SearchBar";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  onOpenSettings: () => void;
  onOpenLogin: () => void;
}

export function Header({ query, onQueryChange, onOpenSettings, onOpenLogin }: Props) {
  const settings = useStore((s) => s.settings);
  const authed = useStore((s) => s.authed);
  const hasPassword = useStore((s) => s.hasPassword);
  const editMode = useStore((s) => s.editMode);
  const toggleEditMode = useStore((s) => s.toggleEditMode);
  const mediaConfigured = useStore((s) => s.mediaConfigured);
  const setAddMediaOpen = useStore((s) => s.setAddMediaOpen);
  const health = useStore((s) => s.health);

  const hasIssue = Object.values(health).some((h) => h.state === "down");

  function handleEditClick() {
    if (!authed && hasPassword) {
      onOpenLogin();
      return;
    }
    toggleEditMode();
  }

  // Opening settings while signed out used to "work", then every action inside
  // failed with a bare Unauthorized. Ask for the password up front instead.
  function handleSettingsClick() {
    if (!authed && hasPassword) {
      onOpenLogin();
      return;
    }
    onOpenSettings();
  }

  // Shown whether or not this browser has a session — a phone is a separate
  // browser from the desktop, so hiding it there just made the feature look
  // missing. Tapping it prompts for the password instead, like Edit does.
  function handleAddClick() {
    if (!authed && hasPassword) {
      onOpenLogin();
      return;
    }
    setAddMediaOpen(true);
  }

  function handleBellClick() {
    document.getElementById("status-row")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <header className="glass flex flex-col gap-5 rounded-3xl p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <Greeting name={settings?.greeting_name ?? ""} />

      <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:justify-end">
        <span className="hairline hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-emerald-400 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Online
        </span>

        <button
          onClick={handleBellClick}
          title="Status"
          className="hairline relative flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border text-ink-muted transition-colors hover:border-accent/60 hover:text-ink"
        >
          🔔
          {hasIssue && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
          )}
        </button>

        <SearchBar
          value={query}
          onChange={onQueryChange}
          searchEngine={settings?.search_engine ?? "https://www.google.com/search?q=%s"}
        />

        {/* Always in the header so it never depends on how far down the media
            row is, or whether it has anything in it yet. */}
        {mediaConfigured && (
          <button
            onClick={handleAddClick}
            title="Add a movie or series"
            className="flex h-[42px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-accent px-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <span className="text-lg leading-none">+</span>
            <span className="hidden sm:inline">Add</span>
          </button>
        )}

        <button
          onClick={handleEditClick}
          className={`hairline shrink-0 whitespace-nowrap rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors ${
            editMode
              ? "border-accent text-accent"
              : "text-ink-muted hover:border-accent/60 hover:text-ink"
          }`}
        >
          {editMode ? "Done" : "Edit"}
        </button>
        <button
          onClick={handleSettingsClick}
          className="hairline flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border text-ink-muted transition-colors hover:border-accent/60 hover:text-ink"
          title="Settings"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
