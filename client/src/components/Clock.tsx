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
      <p className="text-sm font-semibold text-ink-muted">
        {timeGreeting}
        {name ? (
          <>
            , <span className="text-accent">{name}</span>
          </>
        ) : null}
        !
      </p>
      <h1 className="mt-1 text-[clamp(3rem,7vw,5.5rem)] font-extrabold leading-[1] tracking-tight tabular-nums text-ink">
        {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </h1>
      <p className="mt-1.5 text-sm font-medium text-ink-muted">
        {now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      </p>
    </div>
  );
}
