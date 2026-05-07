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
        <div className="text-xs text-muted py-2">
          No benchmark available. Sector classification or 30+ peer cohort required.
        </div>
      </Panel>
    );
  }
  const pct = Math.round(benchmark.percentile);
  return (
    <Panel
      title="Sector benchmark"
      subtitle={benchmark.sector_label ?? benchmark.sector ?? ""}
    >
      <div className="space-y-3">
        <div className="flex items-baseline gap-2">
          <div className="text-2xl font-semibold tabular text-fg">
            {pct}
            <span className="text-sm font-normal text-muted">th</span>
          </div>
          <div className="text-xs text-muted">
            percentile · {benchmark.cohort_size} peers
          </div>
        </div>
        <div className="relative h-2 rounded bg-panel border border-border overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-elev/40" style={{ width: `${pct}%` }} />
          <div className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: `${pct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px] tabular">
          <div>
            <div className="text-muted">This co.</div>
            <div className="font-semibold">{score}</div>
          </div>
          <div>
            <div className="text-muted">Sector p50</div>
            <div className="font-semibold">{benchmark.sector_median ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted">Z-score</div>
            <div className="font-semibold">{benchmark.z_score?.toFixed(2) ?? "—"}</div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
