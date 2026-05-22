import { Panel } from "@/components/Panel";
import { ArrowUpRight, BarChart3, Database, Gavel, Scale } from "lucide-react";

export const metadata = {
  title: "Methodology - LexPulse",
};

const scoreSteps = [
  {
    title: "Coverage",
    body: "LexPulse starts with federal civil dockets from CourtListener and resolves parties to company records.",
    icon: <Database className="size-4" />,
  },
  {
    title: "Current pressure",
    body: "Recent filings, 30-day spikes, and active case volume move the Current component.",
    icon: <BarChart3 className="size-4" />,
  },
  {
    title: "Structural exposure",
    body: "Longer-running case volume, jurisdiction mix, case category, judge signals, and concentration shape the Structural component.",
    icon: <Scale className="size-4" />,
  },
  {
    title: "Review signal",
    body: "The product translates the raw score into Review now, Monitor, or Quiet so daily workflows do not depend on score interpretation alone.",
    icon: <Gavel className="size-4" />,
  },
];

export default function MethodologyPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <header className="border-b border-border pb-6">
        <div className="text-xs uppercase tracking-[0.18em] text-muted">Methodology</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">How LexPulse scores litigation risk</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
          LexPulse is a litigation monitoring system, not a legal opinion. The score ranks company-level
          federal litigation pressure so analysts can decide what deserves review first.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {scoreSteps.map((step) => (
          <div key={step.title} className="rounded-xl border border-border bg-panel/60 p-5">
            <div className="grid size-9 place-items-center rounded-lg border border-border bg-panel2 text-muted">
              {step.icon}
            </div>
            <h2 className="mt-4 text-sm font-semibold">{step.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{step.body}</p>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.8fr]">
        <Panel title="What goes into the score" subtitle="The v3 score is bounded from 0 to 100.">
          <div className="space-y-5 text-sm leading-6 text-muted">
            <p>
              The model combines volume, recency, severity, momentum, concentration, jurisdiction,
              judge profile, firm signal, and similarity signal factors. A company with many recent
              filings in severe categories will rise faster than a company with old, low-severity dockets.
            </p>
            <p>
              Drivers are stored with each score snapshot. The product uses those drivers to explain
              why a company moved and to build the Review now queue.
            </p>
            <p>
              Sector benchmarks are shown only when the peer cohort is large enough. If the cohort is
              too small, LexPulse suppresses percentile claims instead of presenting weak comparisons.
            </p>
          </div>
        </Panel>

        <Panel title="How to read the bands" subtitle="Bands are workflow hints, not legal conclusions.">
          <dl className="space-y-4">
            <Band label="High" color="text-bad" body="Review now. The company has heavy or fast-moving litigation pressure." />
            <Band label="Elevated" color="text-elev" body="Monitor closely. Pressure is meaningful, but may be sector or category specific." />
            <Band label="Moderate" color="text-warn" body="Keep on watch. Recent or baseline activity exists, but urgency is lower." />
            <Band label="Low" color="text-ok" body="Quiet. No urgent score movement or recent filing pressure." />
          </dl>
        </Panel>
      </div>

      <Panel title="Validation" subtitle="What the current calibration supports.">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4 text-sm leading-6 text-muted">
            <p>
              LexPulse backtests public-company scores against SEC 8-K material-event disclosures.
              The signal is strongest at longer horizons and weaker at 30 days. That is why the product
              is framed around monitoring and prioritization, not short-term event prediction.
            </p>
            <p>
              Private companies use the same score mechanics, but they do not have the same 8-K validation
              path. Confidence indicators on company profiles show when sector and SEC identity data are
              present or missing.
            </p>
          </div>
          <a
            href="/calibration"
            className="flex h-fit items-center justify-between gap-4 rounded-lg border border-border bg-panel2/50 p-4 text-sm transition hover:border-accent/60 hover:text-accent"
          >
            View calibration detail
            <ArrowUpRight className="size-4" />
          </a>
        </div>
      </Panel>

      <Panel title="Source and limits" subtitle="What the score does not claim.">
        <ul className="space-y-3 text-sm leading-6 text-muted">
          <li>LexPulse does not predict case outcomes or provide legal advice.</li>
          <li>Source dockets come from CourtListener / Free Law Project and may lag court activity.</li>
          <li>Entity resolution can miss subsidiaries, renamed companies, or ambiguous parties.</li>
          <li>Score movement can reflect ingest timing as well as real litigation activity.</li>
        </ul>
      </Panel>
    </div>
  );
}

function Band({ label, color, body }: { label: string; color: string; body: string }) {
  return (
    <div>
      <dt className={`text-sm font-semibold ${color}`}>{label}</dt>
      <dd className="mt-1 text-sm leading-5 text-muted">{body}</dd>
    </div>
  );
}
