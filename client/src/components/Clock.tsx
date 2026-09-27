import { useEffect, useState } from "react";

export function Greeting({ name }: { name: string }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 20);
    return () => clearInterval(id);
  }, []);

  const hour = now.getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="min-w-0">
      <p className="text-lg font-semibold text-ink">
        {timeGreeting}
        {name ? (
          <>
            , <span className="text-accent">{name}</span>
          </>
        ) : null}
        !
      </p>
      <h1 className="mt-1 text-[clamp(1.75rem,4vw,3.25rem)] font-extrabold leading-[1.1] tracking-tight tabular-nums text-ink">
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </h1>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
        {now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      </p>
    </div>
  );
}
