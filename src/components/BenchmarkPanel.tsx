import { Panel } from "./Panel";

export type Benchmark = {
  sector?: string | null;
  sector_label?: string | null;
  cohort_size?: number | null;
  percentile?: number | null;
  sector_median?: number | null;
  z_score?: number | null;
} | null;

export function BenchmarkPanel({ benchmark, score }: { benchmark: Benchmark; score: number }) {
  if (!benchmark || benchmark.percentile === null || benchmark.percentile === undefined) {
    return (
      <Panel title="Sector benchmark">
        <div className="text-xs text-muted py-3 leading-relaxed">
          No benchmark available. Sector classification or a 30+ peer cohort is required for a
          percentile rank.
        </div>
      </Panel>
    );
  }
  const pct = Math.round(benchmark.percentile);
  // Suffix English ordinal (1st, 2nd, 3rd, 4th, ...) for the percentile.
  const suffix =
    pct % 100 >= 11 && pct % 100 <= 13
      ? "th"
      : ["th", "st", "nd", "rd"][pct % 10] ?? "th";
  return (
    <Panel
      title="Sector benchmark"
      subtitle={benchmark.sector_label ?? benchmark.sector ?? ""}
    >
      <div className="space-y-5">
        <div className="flex items-baseline gap-3">
          <div className="font-display text-4xl font-semibold tabular text-fg leading-none tracking-tight">
            {pct}
            <span className="text-base font-normal text-muted ml-0.5">{suffix}</span>
          </div>
          <div className="text-xs text-muted">
            percentile · {benchmark.cohort_size?.toLocaleString()} peers
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="relative h-2 rounded-full bg-panel2 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-accent/70 to-accent/30 rounded-full origin-left transition-transform duration-700"
              style={{ transform: `scaleX(${Math.max(0, Math.min(1, pct / 100))})` }}
            />
            <div
              className="absolute -top-1 -bottom-1 w-0.5 bg-fg shadow-glow"
              style={{ left: `calc(${pct}% - 1px)` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted/70 tabular">
            <span>0</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border text-xs">
          <Stat label="This co." value={score.toString()} />
          <Stat label="Sector p50" value={benchmark.sector_median?.toString() ?? "—"} />
          <Stat label="Z-score" value={benchmark.z_score?.toFixed(2) ?? "—"} />
        </div>
      </div>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="font-semibold tabular mt-1">{value}</div>
    </div>
  );
}
