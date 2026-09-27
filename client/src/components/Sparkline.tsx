interface Props {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  responsive?: boolean;
}

export function Sparkline({ values, width = 120, height = 36, color, responsive }: Props) {
  if (values.length < 2) {
    return (
      <div
        style={responsive ? { height } : { width, height }}
        className={`flex items-center text-[10px] text-ink-muted ${responsive ? "w-full" : ""}`}
      >
        Collecting…
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => `${i * step},${height - ((v - min) / span) * height}`);
  const strokeColor = color ?? "var(--accent)";
  const fillPoints = `0,${height} ${points.join(" ")} ${width},${height}`;

  return (
    <svg
      width={responsive ? "100%" : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={responsive ? "none" : undefined}
      className="overflow-visible"
    >
      <polyline points={fillPoints} fill={strokeColor} opacity={0.12} stroke="none" />
      <polyline points={points.join(" ")} fill="none" stroke={strokeColor} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
