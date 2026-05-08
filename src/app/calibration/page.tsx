import { prisma } from "@/lib/db";
import { Panel } from "@/components/Panel";
import { CalibrationDecileChart } from "@/components/CalibrationDecileChart";
import {
  hitRateByBand,
  spearman,
  decileLift,
  meanStd,
  type BacktestObs,
  type Window,
} from "@/lib/backtest-stats";
import { cn, formatRelative } from "@/lib/utils";

// ISR: regenerate hourly. Backtest runs weekly; sub-hour freshness is
// overkill but cheap.
export const revalidate = 3600;

const SCORE_VERSION = "v3";

async function loadObservations(): Promise<{
  rows: BacktestObs[];
  anchorTimes: number[];
  computedAt: Date | null;
}> {
  const rows = await prisma.backtestObservation.findMany({
    where: { scoreVersion: SCORE_VERSION },
    select: {
      anchorDate: true,
      scoreAtAnchor: true,
      band: true,
      hadEvent30: true,
      hadEvent90: true,
      hadEvent180: true,
      computedAt: true,
    },
    orderBy: { computedAt: "desc" },
  });
  const anchors = new Set<number>();
  let computedAt: Date | null = null;
  const obs: BacktestObs[] = rows.map((r) => {
    anchors.add(r.anchorDate.getTime());
    if (!computedAt || r.computedAt > computedAt) computedAt = r.computedAt;
    return {
      scoreAtAnchor: r.scoreAtAnchor,
      band: r.band,
      hadEvent30: r.hadEvent30,
      hadEvent90: r.hadEvent90,
      hadEvent180: r.hadEvent180,
    };
  });
  return { rows: obs, anchorTimes: [...anchors].sort(), computedAt };
}

function computeIc(rows: BacktestObs[], anchorTimes: number[], window: Window) {
  // We don't have anchor on BacktestObs after the projection above (we
  // dropped it). Re-fetch grouping client-side requires the timestamp.
  // For the page view we approximate per-anchor IC by recomputing
  // cohort buckets using a pre-grouped fetch instead. Keep simple and
  // compute one global IC rather than per-anchor mean. Dashboard view
  // is illustrative; the canonical numbers come from the harness.
  const xs = rows.map((r) => r.scoreAtAnchor);
  const ys = rows.map((r) =>
    window === 30 ? (r.hadEvent30 ? 1 : 0) : window === 90 ? (r.hadEvent90 ? 1 : 0) : r.hadEvent180 ? 1 : 0,
  );
  return spearman(xs, ys);
}

const BAND_ORDER = ["low", "moderate", "elevated", "high"];

const BAND_STYLE: Record<string, string> = {
  low: "text-ok",
  moderate: "text-warn",
  elevated: "text-elev",
  high: "text-bad",
};

export default async function CalibrationPage() {
  const { rows, anchorTimes, computedAt } = await loadObservations();

  if (rows.length === 0) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-12 space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight font-display">
          Score v3 Calibration
        </h1>
        <Panel title="No backtest data yet">
          <p className="px-5 py-4 text-sm text-muted leading-relaxed">
            The calibration harness has not run yet (or this DB has no{" "}
            <code className="font-mono">backtest_observations</code> rows for{" "}
            <code className="font-mono">scoreVersion={SCORE_VERSION}</code>).
            Run <code className="font-mono">npm run backtest</code> after the
            EDGAR ingest and material-event extraction complete.
          </p>
        </Panel>
      </main>
    );
  }

  const reports: { window: Window; hr: ReturnType<typeof hitRateByBand>; deciles: ReturnType<typeof decileLift>; ic: number }[] = [
    { window: 30, hr: hitRateByBand(rows, 30), deciles: decileLift(rows, 30), ic: computeIc(rows, anchorTimes, 30) },
    { window: 90, hr: hitRateByBand(rows, 90), deciles: decileLift(rows, 90), ic: computeIc(rows, anchorTimes, 90) },
    { window: 180, hr: hitRateByBand(rows, 180), deciles: decileLift(rows, 180), ic: computeIc(rows, anchorTimes, 180) },
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted font-mono">Methodology v3</p>
        <h1 className="text-3xl font-semibold tracking-tight font-display">
          Score Calibration
        </h1>
        <p className="text-sm text-muted leading-relaxed max-w-2xl">
          v3 risk scores back-tested against SEC 8-K material-event disclosures
          across {rows.length.toLocaleString()} observations from{" "}
          {anchorTimes.length} monthly anchor dates. The score is calibrated
          on the public-company subset of our universe. Read{" "}
          <a className="underline decoration-dotted hover:text-text" href="https://github.com/abhiyoheswaran1/LexPulse/blob/main/docs/methodology/calibration-v3.md">
            the full methodology
          </a>{" "}
          for limitations.
        </p>
        {computedAt && (
          <p className="text-xs text-muted font-mono">
            last run {formatRelative(computedAt)}
          </p>
        )}
      </header>

      <Panel title="Information Coefficient" subtitle="Spearman rank correlation between score and forward-window 8-K event indicator. Pooled across anchors.">
        <div className="grid grid-cols-3 divide-x divide-border">
          {reports.map(({ window, ic }) => (
            <div key={window} className="px-5 py-4">
              <p className="text-xs text-muted font-mono">{window}d window</p>
              <p className="text-2xl font-semibold tabular font-display mt-1">
                {ic.toFixed(3)}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      {reports.map(({ window, hr, deciles }) => (
        <Panel
          key={window}
          title={`${window}-day forward window`}
          subtitle={`Base rate ${(hr.baseRate * 100).toFixed(1)}% · ${rows.length.toLocaleString()} observations`}
        >
          <div className="px-5 py-4 space-y-6">
            <div>
              <h3 className="text-xs uppercase tracking-widest text-muted font-mono mb-3">
                Hit rate by band
              </h3>
              <table className="w-full text-sm tabular">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="font-medium pb-2">Band</th>
                    <th className="font-medium pb-2 text-right">n</th>
                    <th className="font-medium pb-2 text-right">Hits</th>
                    <th className="font-medium pb-2 text-right">Rate</th>
                    <th className="font-medium pb-2 text-right">Lift</th>
                  </tr>
                </thead>
                <tbody>
                  {BAND_ORDER.map((band) => {
                    const b = hr.byBand[band];
                    if (!b) return null;
                    return (
                      <tr key={band} className="border-t border-border/50">
                        <td className={cn("py-2 font-medium capitalize", BAND_STYLE[band])}>{band}</td>
                        <td className="py-2 text-right font-mono">{b.n.toLocaleString()}</td>
                        <td className="py-2 text-right font-mono">{b.hits}</td>
                        <td className="py-2 text-right font-mono">{(b.rate * 100).toFixed(1)}%</td>
                        <td className="py-2 text-right font-mono">
                          {b.lift > 0 ? `${b.lift.toFixed(2)}×` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-widest text-muted font-mono mb-3">
                Decile lift curve
              </h3>
              <CalibrationDecileChart deciles={deciles} />
            </div>
          </div>
        </Panel>
      ))}

      <Panel title="What this means for the score">
        <div className="px-5 py-4 text-sm leading-relaxed text-muted space-y-3">
          <p>
            <span className="text-text">IC ≥ 0.10</span> on a heuristic score
            with no machine learning is respectable; <span className="text-text">≥ 0.15</span>{" "}
            is strong by quant-finance standards.
          </p>
          <p>
            <span className="text-text">Lift &gt; 2.0x</span> on the high
            band means companies in that band file material-event 8-Ks at
            more than twice the population base rate within the forward
            window. That's the score sorting power we sell.
          </p>
          <p>
            Calibration is on the SEC-registered subset of our universe.
            Private companies use the same methodology applied to similar
            case patterns; their score is not directly validated by 8-K
            backtest. See the methodology doc for full limitations.
          </p>
        </div>
      </Panel>
    </main>
  );
}
