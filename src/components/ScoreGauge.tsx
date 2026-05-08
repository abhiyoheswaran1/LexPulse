import { cn, bandColor } from "@/lib/utils";

// Radial score gauge. Score in the center, band rendered as a chip below
// (avoids the cramped two-line stack inside the circle that was making
// the band label collide with the number on long values).
export function ScoreGauge({
  score,
  band,
  size = 168,
}: {
  score: number;
  band: string;
  size?: number;
}) {
  const stroke = 12;
  const r = size / 2 - stroke / 2 - 2;
  const c = 2 * Math.PI * r;
  const fill = (Math.max(0, Math.min(100, score)) / 100) * c;

  // Tick marks at 25 / 50 / 75 to anchor the score against band boundaries.
  const ticks = [0.25, 0.5, 0.75].map((p) => {
    const angle = -Math.PI / 2 + 2 * Math.PI * p;
    const cx = size / 2;
    const cy = size / 2;
    const inner = r - stroke / 2 - 2;
    const outer = r + stroke / 2 + 2;
    return {
      x1: cx + Math.cos(angle) * inner,
      y1: cy + Math.sin(angle) * inner,
      x2: cx + Math.cos(angle) * outer,
      y2: cy + Math.sin(angle) * outer,
    };
  });

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          {/* track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="hsl(220 12% 18%)"
            strokeWidth={stroke}
            fill="none"
          />
          {/* filled arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${fill} ${c - fill}`}
            className={cn(bandColor(band), "transition-[stroke-dasharray] duration-700")}
          />
          {/* band-boundary ticks */}
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              stroke="hsl(220 10% 26%)"
              strokeWidth={1.5}
            />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div
            className={cn(
              "tabular font-semibold tracking-tight leading-none",
              bandColor(band),
            )}
            style={{ fontSize: size * 0.32 }}
          >
            {Math.round(score)}
          </div>
        </div>
      </div>
      <BandChip band={band} />
    </div>
  );
}

function BandChip({ band }: { band: string }) {
  const cls: Record<string, string> = {
    high: "bg-bad/12 text-bad border-bad/40",
    elevated: "bg-elev/12 text-elev border-elev/40",
    moderate: "bg-warn/12 text-warn border-warn/40",
    low: "bg-ok/12 text-ok border-ok/40",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.18em]",
        cls[band] ?? cls.low,
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-80" />
      {band}
    </span>
  );
}
