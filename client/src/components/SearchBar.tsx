import { useRef } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  searchEngine: string;
}

export function SearchBar({ value, onChange, searchEngine }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && value.trim()) {
      const url = searchEngine.replace("%s", encodeURIComponent(value.trim()));
      window.open(url, "_blank");
    }
    if (e.key === "Escape") {
      onChange("");
      inputRef.current?.blur();
    }
  }

  return (
    <div className="relative order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1 lg:w-80 lg:flex-none">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted">
        ⌕
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search or press Enter…"
        className="glass w-full rounded-xl py-2.5 pl-11 pr-14 text-sm text-ink placeholder:text-ink-muted focus:border-accent/60 focus:outline-none"
      />
      <kbd className="hairline pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border sunken px-1.5 py-0.5 text-[10px] text-ink-muted">
        ⌘K
      </kbd>
    </div>
  );
}
