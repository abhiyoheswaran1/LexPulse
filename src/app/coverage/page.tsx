import { AlertTriangle, Building2, CheckCircle2, Database, GitBranch, RadioTower } from "lucide-react";
import { getCoverageReport } from "@/lib/coverage-data";

export const dynamic = "force-dynamic";

export default async function CoveragePage() {
  const report = await getCoverageReport();
  const matchPct = Math.round(report.parties.matchRate * 100);

  return (
    <main className="space-y-8">
      <section className="flex flex-col gap-6 border-b border-border pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted">Data coverage</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg">Coverage monitor</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">
            Canonical company universe, entity-match confidence, source freshness, and extraction coverage for the LexPulse data pipeline.
          </p>
        </div>
        <a
          href="/status"
          className="inline-flex w-fit items-center gap-2 rounded-md border border-border px-3 py-2 text-xs uppercase tracking-[0.14em] text-muted transition hover:border-accent/50 hover:text-accent"
        >
          Platform status
        </a>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <CoverageCard icon={<Building2 size={18} />} label="Master companies" value={report.companyMasters} detail={`${report.universe.secListed.toLocaleString()} SEC-listed`} />
        <CoverageCard icon={<GitBranch size={18} />} label="Party match rate" value={`${matchPct}%`} detail={`${report.parties.unresolved.toLocaleString()} unresolved parties`} />
        <CoverageCard icon={<Database size={18} />} label="External events" value={report.enrichment.externalEvents} detail={`${report.enrichment.caseOutcomes.toLocaleString()} case outcomes`} />
        <CoverageCard
          icon={report.operations.needsAttention ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          label="Operations"
          value={report.operations.needsAttention ? "Review" : "Healthy"}
          detail={`${report.operations.failedRuns24h.toLocaleString()} failed runs in 24h`}
          tone={report.operations.needsAttention ? "warn" : "ok"}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel title="Universe" subtitle="What LexPulse can intentionally track.">
          <MetricRow label="SEC listed" value={report.universe.secListed} max={Math.max(report.companyMasters, 1)} />
          <MetricRow label="S&P 1500 imports" value={report.universe.sp1500} max={Math.max(report.companyMasters, 1)} />
          <MetricRow label="Russell 3000 imports" value={report.universe.russell3000} max={Math.max(report.companyMasters, 1)} />
        </Panel>

        <Panel title="Entity resolution" subtitle="Observed court parties mapped to canonical companies.">
          <MetricRow label="High confidence" value={report.confidence.high} max={Math.max(report.confidence.high + report.confidence.medium + report.confidence.low, 1)} />
          <MetricRow label="Medium confidence" value={report.confidence.medium} max={Math.max(report.confidence.high + report.confidence.medium + report.confidence.low, 1)} />
          <MetricRow label="Low confidence" value={report.confidence.low} max={Math.max(report.confidence.high + report.confidence.medium + report.confidence.low, 1)} />
        </Panel>
      </section>

      <Panel title="Source health" subtitle="Last successful run per source and whether any job is stale or failing.">
        {report.sourceHealth.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            No source jobs have reported health yet.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {report.sourceHealth.map((run) => (
              <div key={`${run.source}-${run.jobType}`} className="rounded-lg border border-border bg-panel2/35 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{run.source}</div>
                    <div className="mt-1 truncate text-xs text-muted">{run.jobType}</div>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${healthClass(run.health)}`}>
                    {run.health}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="uppercase tracking-[0.12em] text-muted">Last success</dt>
                    <dd className="mt-1 text-fg/85">{run.lastSuccessfulAt ? formatDate(run.lastSuccessfulAt) : "Never"}</dd>
                  </div>
                  <div>
                    <dt className="uppercase tracking-[0.12em] text-muted">Failed rows</dt>
                    <dd className="mt-1 tabular text-fg/85">{run.rowsFailed.toLocaleString()}</dd>
                  </div>
                </dl>
                {run.error && <p className="mt-3 line-clamp-2 text-xs leading-5 text-danger">{run.error}</p>}
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Recent ingest runs" subtitle="Latest source jobs and enrichment passes.">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-[0.14em] text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Job</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Fetched</th>
                <th className="px-4 py-3 text-right font-medium">Inserted</th>
                <th className="px-4 py-3 text-right font-medium">Failed</th>
                <th className="px-4 py-3 font-medium">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {report.sources.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    No ingest runs have been recorded yet.
                  </td>
                </tr>
              ) : (
                report.sources.map((run) => (
                  <tr key={`${run.source}-${run.jobType}-${run.startedAt}`}>
                    <td className="px-4 py-3">{run.source}</td>
                    <td className="px-4 py-3 text-muted">{run.jobType}</td>
                    <td className="px-4 py-3">
                      <span className={run.status === "success" ? "text-ok" : run.status === "running" ? "text-accent" : "text-danger"}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular">{run.rowsFetched.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular">{run.rowsInserted.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular">{run.rowsFailed.toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(run.startedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <section className="rounded-lg border border-border bg-panel/60 p-5 text-sm text-muted">
        <div className="mb-2 flex items-center gap-2 text-fg">
          <RadioTower size={16} className="text-accent" />
          Source stance
        </div>
        LexPulse uses free/official sources first: SEC company and filing APIs, CourtListener, SEC litigation releases, and CFPB enforcement actions. Paid PACER crawling, proprietary index feeds, and state-court expansion are intentionally deferred.
      </section>
    </main>
  );
}

function CoverageCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  detail: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-lg border border-border bg-panel/60 p-5">
      <div className={`mb-4 inline-flex rounded-md border border-border p-2 ${tone === "ok" ? "text-ok" : tone === "warn" ? "text-danger" : "text-accent"}`}>
        {icon}
      </div>
      <div className="text-xs uppercase tracking-[0.16em] text-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular text-fg">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="mt-1 text-xs text-muted">{detail}</div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-panel/50">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function MetricRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div className="py-3">
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className="text-fg">{label}</span>
        <span className="tabular text-muted">{value.toLocaleString()}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-panel2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function healthClass(health: "healthy" | "running" | "stale" | "failed") {
  if (health === "healthy") return "border-ok/40 bg-ok/10 text-ok";
  if (health === "running") return "border-accent/40 bg-accent/10 text-accent";
  if (health === "stale") return "border-warn/40 bg-warn/10 text-warn";
  return "border-danger/40 bg-danger/10 text-danger";
}
