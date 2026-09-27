interface Props {
  value: number | null;
  label: string;
  sublabel?: string;
  color?: string;
  size?: number;
}

export function Gauge({ value, label, sublabel, color, size = 72 }: Props) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - pct / 100);
  const ringColor = color ?? "var(--accent)";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={5}
            className="stroke-current text-ink/10"
          />
          {value != null && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={ringColor}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-ink">
          {value == null ? "—" : `${Math.round(value)}%`}
        </div>
      </div>
      <div className="text-center leading-tight">
        <p className="text-[11px] font-semibold text-ink-muted">{label}</p>
        {sublabel && <p className="text-[10px] text-ink-muted/70">{sublabel}</p>}
      </div>
    </div>
  );
}
