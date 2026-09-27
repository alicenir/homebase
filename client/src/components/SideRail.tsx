import { useStore } from "../store/useStore";

interface Props {
  onOpenSettings: () => void;
  onOpenLogin: () => void;
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const LINKS = [
  { id: "apps-section", icon: "▦", title: "Applications" },
  { id: "status-row", icon: "☰", title: "Status" },
  { id: "media-section", icon: "▤", title: "Media" },
];

/**
 * Purely a set of in-page scroll shortcuts — the dashboard stays one
 * scrolling page (per explicit decision), this just gives it the icon-rail
 * look without splitting anything into separate routes.
 */
export function SideRail({ onOpenSettings, onOpenLogin }: Props) {
  const authed = useStore((s) => s.authed);
  const hasPassword = useStore((s) => s.hasPassword);

  function handleSettingsClick() {
    if (!authed && hasPassword) {
      onOpenLogin();
      return;
    }
    onOpenSettings();
  }

  return (
    <nav className="glass sticky top-8 hidden h-fit shrink-0 flex-col items-center gap-2 rounded-2xl p-2 lg:flex">
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        title="Top"
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/20 text-accent"
      >
        ⌂
      </button>
      {LINKS.map((link) => (
        <button
          key={link.id}
          onClick={() => scrollTo(link.id)}
          title={link.title}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted transition-colors hover-sunken hover:text-ink"
        >
          {link.icon}
        </button>
      ))}
      <div className="hairline my-1 h-px w-6 border-t" />
      <button
        onClick={handleSettingsClick}
        title="Settings"
        className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted transition-colors hover-sunken hover:text-ink"
      >
        ⚙
      </button>
    </nav>
  );
}
