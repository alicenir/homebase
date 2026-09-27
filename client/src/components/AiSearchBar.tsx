import { useState } from "react";
import { useStore } from "../store/useStore";

interface Props {
  onAsk: (question: string) => void;
}

export function AiSearchBar({ onAsk }: Props) {
  const settings = useStore((s) => s.settings);
  const assistantConfigured = settings?.assistant_configured === "true";
  const [ask, setAsk] = useState("");

  if (!assistantConfigured) return null;

  function submit() {
    const q = ask.trim();
    if (!q) return;
    onAsk(q);
    setAsk("");
  }

  return (
    <section className="glass rounded-3xl p-5 sm:p-6">
      <div className="mx-auto flex max-w-2xl items-center gap-2 rounded-2xl sunken p-1.5 pl-4">
        <span className="text-lg text-accent">✦</span>
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Ask anything…"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={!ask.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          title="Ask"
        >
          →
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-ink-muted">
        Ask about your downloads, media, containers, indexers and more.
      </p>
    </section>
  );
}
