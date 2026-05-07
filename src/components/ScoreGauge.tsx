import { bandColor } from "@/lib/utils";

// Simple radial-style gauge built from SVG arcs. No external chart needed.
export function ScoreGauge({ score, band }: { score: number; band: string }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  const fill = (score / 100) * c;

  return (
    <div className="relative inline-block">
      <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
        <circle cx="70" cy="70" r={r} stroke="hsl(220 12% 18%)" strokeWidth="10" fill="none" />
        <circle
          cx="70"
          cy="70"
          r={r}
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${fill} ${c - fill}`}
          className={bandColor(band)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className={`text-3xl font-semibold tabular ${bandColor(band)}`}>{score}</div>
          <div className="text-[10px] uppercase tracking-widest text-muted mt-0.5">{band}</div>
        </div>
      </div>
    </div>
  );
}
