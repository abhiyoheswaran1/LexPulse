import { Activity, AlertCircle, CheckCircle2, Clock3, Database, RadioTower } from "lucide-react";
import { getPlatformStatus } from "@/lib/status";
import { formatRelative } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const status = await getPlatformStatus();
  const sourceCoverage = percentage(status.coverage.sourceLinkedCases, status.coverage.cases);
  const sectorCoverage = percentage(status.coverage.sectorMappedCompanies, status.coverage.companies);
  const scoreCoverage = percentage(status.coverage.scoredCompanies, status.coverage.companies);

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="border-b border-border pb-6">
        <div className="text-xs uppercase tracking-[0.18em] text-muted">Operations</div>
        <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Platform status</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Live health, data freshness, coverage, and integration readiness for the LexPulse intelligence pipeline.
            </p>
          </div>
          <StatusBadge ok={status.ok} />
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatusCard
          icon={<Database className="size-4" />}
          label="Database"
          value={status.database.ok ? "Healthy" : "Unavailable"}
          detail={`${status.database.latencyMs}ms health query`}
          ok={status.database.ok}
        />
        <StatusCard
          icon={<Clock3 className="size-4" />}
          label="Latest score run"
          value={status.freshness.latestScoreAt ? formatRelative(new Date(status.freshness.latestScoreAt)) : "Missing"}
          detail={status.freshness.scoreAgeHours == null ? "No score snapshots found" : `${status.freshness.scoreAgeHours}h old`}
          ok={status.freshness.scoreAgeHours != null && status.freshness.scoreAgeHours <= 48}
        />
        <StatusCard
          icon={<RadioTower className="size-4" />}
          label="Latest alert"
          value={status.freshness.latestAlertAt ? formatRelative(new Date(status.freshness.latestAlertAt)) : "Missing"}
          detail={status.freshness.alertAgeHours == null ? "No alert feed found" : `${status.freshness.alertAgeHours}h old`}
          ok={status.freshness.alertAgeHours != null && status.freshness.alertAgeHours <= 72}
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-border bg-panel/60">
          <header className="border-b border-border px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold">Coverage</h2>
                <p className="mt-1 text-xs text-muted">How much of the universe is scored, mapped, and source-linked.</p>
              </div>
              <a href="/coverage" className="text-xs text-muted transition hover:text-accent">
                Details
              </a>
            </div>
          </header>
          <div className="space-y-5 p-5">
            <CoverageRow label="Scored companies" value={scoreCoverage} detail={`${status.coverage.scoredCompanies.toLocaleString()} of ${status.coverage.companies.toLocaleString()}`} />
            <CoverageRow label="Sector mapped" value={sectorCoverage} detail={`${status.coverage.sectorMappedCompanies.toLocaleString()} mapped companies`} />
            <CoverageRow label="Source-linked cases" value={sourceCoverage} detail={`${status.coverage.sourceLinkedCases.toLocaleString()} CourtListener-linked cases`} />
            <CoverageRow
              label="Sector confidence"
              value={Math.round((status.coverage.sectorConfidence ?? 0) * 100)}
              detail={status.coverage.sectorConfidence == null ? "No confidence scores available" : "Average entity-sector confidence"}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-panel/60">
          <header className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Operational counters</h2>
            <p className="mt-1 text-xs text-muted">Short-horizon activity and integration state.</p>
          </header>
          <dl className="grid grid-cols-1 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0 xl:grid-cols-1 xl:divide-x-0 xl:divide-y">
            <MiniMetric label="Score snapshots, 24h" value={status.operations.scoreSnapshots24h.toLocaleString()} />
            <MiniMetric label="Alerts, 24h" value={status.operations.alerts24h.toLocaleString()} />
            <MiniMetric label="Failed ingests, 24h" value={status.operations.failedIngests24h.toLocaleString()} />
          </dl>
          <div className="border-t border-border p-5">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Integrations</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Integration label="Sentry" ready={status.integrations.sentry} />
              <Integration label="Slack" ready={status.integrations.slack} />
              <Integration label="Email" ready={status.integrations.email} />
              <Integration label="Billing" ready={status.integrations.billing} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-panel/60 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Production health endpoint</h2>
            <p className="mt-1 text-sm text-muted">Use this endpoint for uptime checks and release verification.</p>
          </div>
          <a
            href="/api/health"
            className="inline-flex w-fit items-center gap-2 rounded-md border border-border px-3 py-2 text-xs uppercase tracking-[0.14em] text-muted transition hover:border-accent/60 hover:text-accent"
          >
            Open /api/health
            <Activity className="size-3.5" />
          </a>
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${ok ? "border-ok/35 bg-ok/10 text-ok" : "border-bad/35 bg-bad/10 text-bad"}`}>
      {ok ? <CheckCircle2 className="size-3.5" /> : <AlertCircle className="size-3.5" />}
      {ok ? "Operational" : "Needs attention"}
    </span>
  );
}

function StatusCard({ icon, label, value, detail, ok }: { icon: React.ReactNode; label: string; value: string; detail: string; ok: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-panel/60 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="grid size-9 place-items-center rounded-md border border-border bg-panel2/60 text-muted">{icon}</div>
        {ok ? <CheckCircle2 className="size-4 text-ok" /> : <AlertCircle className="size-4 text-bad" />}
      </div>
      <div className="mt-4 text-[10px] uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="mt-2 text-sm text-muted">{detail}</div>
    </div>
  );
}

function CoverageRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono tabular text-muted">{value}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(2, value))}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-5">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="mt-2 font-mono text-2xl font-semibold tabular">{value}</dd>
    </div>
  );
}

function Integration({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-panel2/35 px-3 py-2">
      <span>{label}</span>
      <span className={ready ? "text-ok" : "text-muted"}>{ready ? "Ready" : "Not configured"}</span>
    </div>
  );
}

function percentage(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}
