import { bandColor } from "@/lib/utils";

type Breakdown = {
  volume: number;
  recency: number;
  severity: number;
  momentum?: number;
  concentration?: number;
  jurisdiction?: number;
  judge?: number;
};

// Simple radial-style gauge built from SVG arcs. No external chart needed.
// When `breakdown` is provided, renders a per-component readout below
// (3 bars for v1, 6 for v2, up to 7 for v3 including the judge factor).
export function ScoreGauge({
  score,
  band,
  breakdown,
}: {
  score: number;
  band: string;
  breakdown?: Breakdown;
}) {
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
      {breakdown && (
        <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1 text-[10px] tabular text-muted">
          {(
            [
              ["vol", breakdown.volume],
              ["rec", breakdown.recency],
              ["sev", breakdown.severity],
              ["mom", breakdown.momentum],
              ["cnc", breakdown.concentration],
              ["jur", breakdown.jurisdiction],
              ["jdg", breakdown.judge],
            ] as Array<[string, number | undefined]>
          )
            .filter((e): e is [string, number] => typeof e[1] === "number")
            .map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-1">
                <span className="uppercase tracking-wider opacity-60">{k}</span>
                <span className="font-medium opacity-90">{v.toFixed(2)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
