import { prisma } from "@/lib/db";
import { CalibrationDecileChart } from "@/components/CalibrationDecileChart";
import {
  hitRateByBand,
  spearman,
  decileLift,
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

function computeIc(rows: BacktestObs[], window: Window) {
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
      <main className="mx-auto max-w-3xl px-6 py-20 space-y-6">
        <p className="text-[10px] uppercase tracking-[0.32em] text-accent/80 font-mono">
          Research Note · v3.0
        </p>
        <h1 className="editorial text-5xl">Score Calibration</h1>
        <p className="font-display text-base text-muted italic leading-relaxed">
          Awaiting first backtest run. Once <code className="not-italic font-mono text-fg">npm run backtest</code> completes, this page renders the calibration appendix in full.
        </p>
      </main>
    );
  }

  const reports: { window: Window; hr: ReturnType<typeof hitRateByBand>; deciles: ReturnType<typeof decileLift>; ic: number }[] = [
    { window: 30, hr: hitRateByBand(rows, 30), deciles: decileLift(rows, 30), ic: computeIc(rows, 30) },
    { window: 90, hr: hitRateByBand(rows, 90), deciles: decileLift(rows, 90), ic: computeIc(rows, 90) },
    { window: 180, hr: hitRateByBand(rows, 180), deciles: decileLift(rows, 180), ic: computeIc(rows, 180) },
  ];

  // The headline is the long-horizon IC — that's where the signal lives.
  const headline = reports[2];

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 space-y-16">
      {/* Editorial hero — research-note framing rather than dashboard. */}
      <header className="relative dot-grid -mx-6 px-6 py-12 lg:py-16 border-y border-border">
        <div className="space-y-8 lift-in">
          <div className="flex items-center gap-4 text-[10px] uppercase tracking-[0.32em] text-accent/80 font-mono">
            <span>Research Note · v3.0</span>
            <span aria-hidden className="h-px flex-1 bg-border" />
            {computedAt && <span className="text-muted">last run {formatRelative(computedAt)}</span>}
          </div>

          <h1 className="editorial text-5xl lg:text-7xl max-w-3xl">
            How well does the score actually
            <span className="italic text-accent"> predict?</span>
          </h1>

          <div className="grid grid-cols-1 lg:grid-cols-[auto,1fr] gap-x-12 gap-y-6 max-w-4xl">
            <div className="lift-in lift-1">
              <div className="text-[10px] uppercase tracking-[0.24em] text-muted font-mono">
                IC, 180-day window
              </div>
              <div className="editorial text-7xl lg:text-8xl tabular text-accent mt-2 leading-none">
                {headline.ic.toFixed(3)}
              </div>
            </div>
            <div className="font-display text-lg leading-relaxed text-fg/90 max-w-xl lift-in lift-2">
              v3 scores back-tested against {rows.length.toLocaleString()} walk-forward
              observations from {anchorTimes.length} monthly anchor dates, using SEC 8-K
              material-event disclosures as ground truth. <span className="italic">The score
              has weak but non-zero predictive validity at long horizons</span> —
              top decile sees {(headline.deciles[9].lift).toFixed(2)}× the base
              event rate, bottom decile {(headline.deciles[0].lift).toFixed(2)}×.
            </div>
          </div>
        </div>
      </header>

      {/* IC summary across windows */}
      <section className="space-y-4 lift-in lift-3">
        <SectionLabel index="01" title="Information Coefficient" />
        <p className="font-display text-base leading-relaxed text-muted max-w-2xl italic">
          Spearman rank correlation between score and forward-window 8-K event
          indicator. Pooled across anchors. IC ≥ 0.10 is respectable for a
          heuristic with no ML; ≥ 0.15 is strong by quant-finance standards.
        </p>
        <div className="grid grid-cols-3 border border-border rounded-xl overflow-hidden">
          {reports.map(({ window, ic }, i) => (
            <div
              key={window}
              className={cn(
                "px-6 py-7",
                i > 0 && "border-l border-border",
                i === 2 && "bg-accent/5",
              )}
            >
              <div className="text-[10px] uppercase tracking-[0.24em] text-muted font-mono">
                {window}-day window
              </div>
              <div className={cn(
                "editorial text-5xl tabular mt-3 leading-none",
                i === 2 ? "text-accent" : "text-fg",
              )}>
                {ic.toFixed(3)}
              </div>
              <div className="text-xs text-muted mt-2 font-mono">
                {ic < 0.05 ? "no signal" : ic < 0.10 ? "weak signal" : ic < 0.15 ? "respectable" : "strong"}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Per-window detail */}
      {reports.map(({ window, hr, deciles }, i) => (
        <section key={window} className="space-y-6">
          <SectionLabel index={String(i + 2).padStart(2, "0")} title={`${window}-day forward window`} />

          <div className="grid grid-cols-1 lg:grid-cols-[1fr,1fr] gap-x-12 gap-y-8">
            <div>
              <h3 className="text-[10px] uppercase tracking-[0.24em] text-muted font-mono mb-3">
                Hit rate by band
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.18em] text-muted font-mono">
                    <th className="font-normal pb-2">Band</th>
                    <th className="font-normal pb-2 text-right">n</th>
                    <th className="font-normal pb-2 text-right">Hits</th>
                    <th className="font-normal pb-2 text-right">Rate</th>
                    <th className="font-normal pb-2 text-right">Lift</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular">
                  {BAND_ORDER.map((band) => {
                    const b = hr.byBand[band];
                    if (!b) return null;
                    return (
                      <tr key={band} className="border-t border-border/40">
                        <td className={cn("py-2.5 font-sans capitalize text-sm", BAND_STYLE[band])}>{band}</td>
                        <td className="py-2.5 text-right">{b.n.toLocaleString()}</td>
                        <td className="py-2.5 text-right">{b.hits}</td>
                        <td className="py-2.5 text-right">{(b.rate * 100).toFixed(1)}%</td>
                        <td className={cn(
                          "py-2.5 text-right",
                          b.lift > 1.2 ? "text-accent" : b.lift < 0.8 ? "text-muted" : "",
                        )}>
                          {b.lift > 0 ? `${b.lift.toFixed(2)}×` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-border">
                    <td className="py-2.5 font-sans text-sm text-muted italic">base</td>
                    <td colSpan={2} />
                    <td className="py-2.5 text-right text-muted">{(hr.baseRate * 100).toFixed(1)}%</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-[10px] uppercase tracking-[0.24em] text-muted font-mono mb-3">
                Decile lift curve
              </h3>
              <CalibrationDecileChart deciles={deciles} />
              <p className="text-xs text-muted mt-3 font-display italic leading-relaxed">
                Companies sorted by score, sliced into 10 equal buckets. Top decile {deciles[9].lift.toFixed(2)}×, bottom {deciles[0].lift.toFixed(2)}×. A clean monotonic curve indicates strong sorting; flatness indicates weak signal.
              </p>
            </div>
          </div>
        </section>
      ))}

      {/* Editorial commentary */}
      <section className="space-y-6 max-w-2xl">
        <SectionLabel index="05" title="What it means" />
        <div className="font-display text-lg leading-[1.7] text-fg/90 space-y-4">
          <p>
            <span className="text-accent">v3 ships as a calibrated weak signal</span> —
            useful for separating the high-risk extreme from the low, but not a
            real-time predictor of materiality. The 30-day signal is essentially
            noise; the 180-day signal is real and consistent across anchors.
          </p>
          <p>
            Calibration is on the SEC-registered subset of our universe (~3% of
            tracked companies). Private companies use the same methodology; their
            score is not directly validated by 8-K backtest.
          </p>
          <p className="italic text-muted">
            Honest reporting earns more trust than overstated claims. v3.1
            iterations target the gaps this calibration exposed: severity
            recalibration by case category, outcome-conditional weighting, and
            long-horizon sub-scoring (already shipped).
          </p>
        </div>
      </section>

      <footer className="border-t border-border pt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-muted font-mono">
        <span>scoreVersion = {SCORE_VERSION}</span>
        <a
          className="hover:text-accent underline decoration-dotted underline-offset-4"
          href="https://github.com/abhiyoheswaran1/LexPulse/blob/main/docs/methodology/calibration-v3.md"
        >
          full methodology →
        </a>
      </footer>
    </main>
  );
}

function SectionLabel({ index, title }: { index: string; title: string }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="text-[10px] tabular text-accent/70 font-mono">{index}</span>
      <h2 className="editorial text-3xl">{title}</h2>
      <span aria-hidden className="h-px flex-1 bg-border self-center" />
    </div>
  );
}
