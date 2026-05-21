import Link from "next/link";
import { prisma } from "@/lib/db";
import { Panel } from "@/components/Panel";
import { RiskBadge } from "@/components/RiskBadge";
import { MoversPanel, type MoverRow } from "@/components/MoversPanel";
import { DashboardPersonalization } from "@/components/workflow/DashboardPersonalization";
import { AdaptiveDataList } from "@/components/ui/AdaptiveDataList";
import { formatRelative, cn } from "@/lib/utils";
import {
  attentionLabel,
  attentionLevel,
  attentionReason,
  summarizeSectors,
  type AttentionLevel,
} from "@/lib/simple-ui";
import { ArrowUpRight, Bell, ListChecks, Map, TrendingUp } from "lucide-react";

export const revalidate = 60;

type Driver = { type?: string };

type CompanySnapshotRow = {
  id: string;
  name: string;
  ticker: string | null;
  sectorKey: string | null;
  sectorLabel: string | null;
  cases: bigint;
  score: number;
  band: string;
  recentCases: number;
  delta7d: number | null;
  drivers: unknown;
  computedAt: Date;
};

type RankedRow = {
  id: string;
  name: string;
  ticker?: string | null;
  caseCount: number;
  score: number;
  band: string;
  recentCases: number;
};

type AttentionRow = RankedRow & {
  sectorKey: string | null;
  sectorLabel: string | null;
  delta7d: number | null;
  driverTypes: string[];
  level: AttentionLevel;
  reason: string;
};

async function getData() {
  const [companyRows, alerts, totals, moverSnapshots] = await Promise.all([
    prisma.$queryRaw<CompanySnapshotRow[]>`
      WITH latest AS (
        SELECT DISTINCT ON ("companyId")
          "companyId", score, band, "recentCases", "delta7d", drivers, "computedAt"
        FROM risk_scores
        WHERE "scoreVersion" = 'v3'
        ORDER BY "companyId", "computedAt" DESC
      )
      SELECT
        c.id,
        c.name,
        c.ticker,
        c."sectorKey",
        s.label AS "sectorLabel",
        COALESCE((SELECT COUNT(*) FROM company_case_link WHERE "companyId" = c.id), 0) AS cases,
        l.score,
        l.band,
        l."recentCases",
        l."delta7d",
        l.drivers,
        l."computedAt"
      FROM latest l
      JOIN companies c ON c.id = l."companyId"
      LEFT JOIN sectors s ON s.key = c."sectorKey"
    `,
    prisma.alert.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { company: { select: { id: true, name: true } } },
    }),
    Promise.all([prisma.company.count(), prisma.case.count(), prisma.alert.count()]),
    prisma.riskScore.findMany({
      where: {
        delta7d: { not: null },
        NOT: { delta7d: 0 },
        scoreVersion: "v3",
      },
      orderBy: { computedAt: "desc" },
      take: 1000,
      include: { company: { select: { id: true, name: true, ticker: true } } },
    }),
  ]);

  const rows = companyRows.map(toAttentionRow);
  const queue = [...rows]
    .filter((row) => row.level !== "quiet")
    .sort((a, b) => {
      const levelDiff = levelSort(b.level) - levelSort(a.level);
      if (levelDiff !== 0) return levelDiff;
      if (b.score !== a.score) return b.score - a.score;
      return b.recentCases - a.recentCases;
    })
    .slice(0, 10);

  const trending = [...rows]
    .filter((row) => row.recentCases > 0)
    .sort((a, b) => b.recentCases - a.recentCases)
    .slice(0, 8);

  const sectors = summarizeSectors(
    rows.map((row) => ({
      sector: row.sectorKey,
      sectorLabel: row.sectorLabel,
      score: row.score,
      band: row.band,
      recentCases: row.recentCases,
      delta7d: row.delta7d,
      driverTypes: row.driverTypes,
    })),
  ).slice(0, 6);

  const seen = new Set<string>();
  const movers: MoverRow[] = moverSnapshots
    .filter((s) => {
      if (seen.has(s.companyId)) return false;
      seen.add(s.companyId);
      return true;
    })
    .map((s) => ({
      id: s.company.id,
      name: s.company.name,
      ticker: s.company.ticker,
      score: s.score,
      band: s.band,
      delta7d: s.delta7d ?? 0,
    }))
    .sort((a, b) => Math.abs(b.delta7d) - Math.abs(a.delta7d))
    .slice(0, 10);

  return {
    totals: { companies: totals[0], cases: totals[1], alerts: totals[2] },
    counts: countLevels(rows),
    queue,
    trending,
    alerts,
    sectors,
    movers,
  };
}

export default async function DashboardPage() {
  const data = await getData();

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="border-b border-border pb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted">Analyst workspace</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Portfolio monitor</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Company-level federal litigation risk, ranked by current score, new filing pressure,
              and material movement.
            </p>
          </div>
          <Link
            href="/api"
            className="inline-flex w-fit items-center gap-2 rounded-md border border-border px-3 py-2 text-xs uppercase tracking-[0.14em] text-muted transition hover:border-accent/50 hover:text-accent"
          >
            API reference
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:max-w-2xl sm:grid-cols-3">
          <Stat label="Companies" value={data.totals.companies.toLocaleString()} />
          <Stat label="Cases" value={data.totals.cases.toLocaleString()} />
          <Stat label="Active alerts" value={data.totals.alerts.toLocaleString()} />
        </dl>
      </header>

      <DashboardPersonalization />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.75fr)]">
        <div className="space-y-6">
          <AttentionSummary
            counts={data.counts}
            queue={data.queue.slice(0, 4)}
            trending={data.trending.slice(0, 4)}
          />

          <div id="review-queue">
            <Panel
              title="Review queue"
              subtitle="Companies needing attention based on score, recent movement, filings, and drivers."
            >
              <ReviewQueue rows={data.queue} />
            </Panel>
          </div>
        </div>

        <div className="space-y-6">
          <SectorConcentration sectors={data.sectors} />
          <MoversPanel rows={data.movers} />
          <RecentAlerts alerts={data.alerts} />
        </div>
      </div>

      <Panel
        title="Recent filing pressure"
        subtitle="Companies with the highest trailing 12-month federal case volume."
        right={
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <TrendingUp className="size-3.5" /> recency weighted
          </span>
        }
      >
        <RiskTable rows={data.trending} showRecent />
      </Panel>
    </div>
  );
}

function AttentionSummary({
  counts,
  queue,
  trending,
}: {
  counts: Record<AttentionLevel, number>;
  queue: AttentionRow[];
  trending: AttentionRow[];
}) {
  return (
    <Panel
      title="Portfolio attention"
      subtitle="Triage mix, next companies to open, and the filing pressure behind the queue."
      right={<ListChecks className="size-4 text-muted" />}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <AttentionCount level="review" value={counts.review} />
          <AttentionCount level="monitor" value={counts.monitor} />
          <AttentionCount level="quiet" value={counts.quiet} />
        </div>

        <AttentionMixBar counts={counts} />

        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
          <NextReviews rows={queue} />
          <FilingPressure rows={trending} />
        </div>
      </div>
    </Panel>
  );
}

function AttentionCount({ level, value }: { level: AttentionLevel; value: number }) {
  return (
    <div className="rounded-lg border border-border/80 bg-panel2/45 px-3 py-3 transition hover:border-fg/20 hover:bg-panel2/70">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted">{attentionLabel(level)}</div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="font-mono text-2xl font-semibold leading-none tabular">{value.toLocaleString()}</div>
        <AttentionPill level={level} label={level === "review" ? "Review" : level === "monitor" ? "Watch" : "Quiet"} />
      </div>
    </div>
  );
}

function AttentionMixBar({ counts }: { counts: Record<AttentionLevel, number> }) {
  const total = counts.review + counts.monitor + counts.quiet;
  const actionable = counts.review + counts.monitor;
  const segments: Array<{ level: AttentionLevel; value: number; className: string }> = [
    { level: "review", value: counts.review, className: "bg-bad" },
    { level: "monitor", value: counts.monitor, className: "bg-warn" },
    { level: "quiet", value: counts.quiet, className: "bg-ok" },
  ];

  return (
    <div className="border-y border-border/70 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-fg/90">Actionable portfolio</div>
          <p className="mt-1 text-xs leading-5 text-muted">
            {actionable.toLocaleString()} companies need review or monitoring before the quiet tail.
          </p>
        </div>
        <div className="font-mono text-sm tabular text-muted">
          {total > 0 ? Math.round((actionable / total) * 100) : 0}% active
        </div>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-panel2">
        {segments.map((segment) =>
          segment.value > 0 ? (
            <div
              key={segment.level}
              className={segment.className}
              style={{ width: `${Math.max(2, (segment.value / Math.max(total, 1)) * 100)}%` }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.12em] text-muted">
        <span>Review {counts.review.toLocaleString()}</span>
        <span>Watch {counts.monitor.toLocaleString()}</span>
        <span>Quiet {counts.quiet.toLocaleString()}</span>
      </div>
    </div>
  );
}

function NextReviews({ rows }: { rows: AttentionRow[] }) {
  return (
    <section className="min-w-0 rounded-lg border border-border/80 bg-panel2/35">
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Next reviews</h3>
        <Link href="#review-queue" className="text-xs text-muted transition hover:text-accent">
          Queue
        </Link>
      </header>
      {rows.length === 0 ? (
        <div className="px-3 py-4 text-sm text-muted">No review candidates right now.</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((row, index) => (
            <li key={row.id}>
              <Link
                href={`/companies/${row.id}`}
                className="group grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-3 px-3 py-3 transition hover:bg-panel/60"
              >
                <span className="mt-0.5 font-mono text-xs tabular text-muted">{index + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-fg/90 group-hover:text-accent">
                    {row.name}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted">{row.reason}</span>
                </span>
                <RiskBadge score={row.score} band={row.band} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FilingPressure({ rows }: { rows: AttentionRow[] }) {
  const maxRecent = Math.max(1, ...rows.map((row) => row.recentCases));

  return (
    <section className="min-w-0 rounded-lg border border-border/80 bg-panel2/35">
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Filing pressure</h3>
        <span className="text-xs text-muted">12mo</span>
      </header>
      {rows.length === 0 ? (
        <div className="px-3 py-4 text-sm text-muted">No recent filing pressure.</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/companies/${row.id}`} className="block px-3 py-3 transition hover:bg-panel/60">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-fg/90">{row.name}</div>
                    <div className="mt-1 text-xs text-muted">{row.caseCount.toLocaleString()} total cases</div>
                  </div>
                  <div className="font-mono text-sm font-semibold tabular text-fg/85">
                    {row.recentCases.toLocaleString()}
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.max(6, (row.recentCases / maxRecent) * 100)}%` }}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SectorConcentration({
  sectors,
}: {
  sectors: ReturnType<typeof summarizeSectors>;
}) {
  return (
    <Panel
      title="Sector concentration"
      subtitle="Where portfolio review pressure is clustered."
      right={<Map className="size-4 text-muted" />}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sectors.map((sector) => (
          <div key={sector.sector} className="rounded-lg border border-border bg-panel2/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{sector.label}</div>
                <div className="mt-1 text-xs text-muted">{sector.total.toLocaleString()} companies</div>
              </div>
              <AttentionPill level={sector.level} label={shortAttentionLabel(sector.level)} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <MiniCount label="Review" value={sector.review} />
              <MiniCount label="Watch" value={sector.monitor} />
              <MiniCount label="Quiet" value={sector.quiet} />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function RecentAlerts({
  alerts,
}: {
  alerts: Array<{
    id: string;
    severity: string;
    title: string;
    createdAt: Date;
    company: { id: string; name: string };
  }>;
}) {
  return (
    <Panel
      title="Recent alerts"
      right={
        <Link href="/alerts" className="text-xs text-muted hover:text-fg">
          View all
        </Link>
      }
    >
      <ul className="space-y-3">
        {alerts.length === 0 && <li className="text-sm text-muted">Nothing new.</li>}
        {alerts.map((alert) => {
          const sev =
            alert.severity === "critical"
              ? "text-bad"
              : alert.severity === "warn"
                ? "text-warn"
                : "text-muted";
          return (
            <li key={alert.id}>
              <Link href={`/companies/${alert.company.id}`} className="block rounded-md px-1 py-1 transition hover:bg-panel2/40">
                <div className="flex items-start gap-2.5">
                  <Bell className={`mt-1 size-3.5 shrink-0 ${sev}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted tabular">
                      {alert.company.name}, {formatRelative(alert.createdAt)}
                    </div>
                    <div className="truncate text-sm transition hover:text-accent">{alert.title}</div>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.16em] text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-2xl font-semibold leading-none tabular text-fg">{value}</dd>
    </div>
  );
}

function ReviewQueue({ rows }: { rows: AttentionRow[] }) {
  if (!rows.length) {
    return <div className="py-8 text-center text-sm text-muted">No companies need review right now.</div>;
  }

  return (
    <AdaptiveDataList
      mobile={rows.map((row) => (
          <Link
            key={row.id}
            href={`/companies/${row.id}`}
            className="block rounded-lg border border-border/70 bg-panel2/35 p-3 transition hover:border-fg/20 hover:bg-panel2/60"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-fg/95">{row.name}</div>
                {row.ticker && <div className="mt-1 text-xs text-muted tabular">{row.ticker}</div>}
              </div>
              <RiskBadge score={row.score} band={row.band} />
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">{row.reason}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <MiniCount label="Cases" value={row.caseCount} />
              <MiniCount label="12mo" value={row.recentCases} />
              <div className="rounded-md border border-border/70 bg-panel/50 px-2 py-2">
                <div className="font-mono text-sm font-semibold tabular">{attentionLabel(row.level)}</div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-muted">Attention</div>
              </div>
            </div>
          </Link>
        ))}
      table={
        <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b border-border text-xs uppercase tracking-[0.14em] text-muted">
          <tr>
            <th className="px-5 py-2.5 text-left font-normal">Company</th>
            <th className="px-4 py-2.5 text-left font-normal">Attention</th>
            <th className="px-4 py-2.5 text-right font-normal">Cases</th>
            <th className="px-4 py-2.5 text-right font-normal">12mo</th>
            <th className="px-4 py-2.5 text-right font-normal">Risk</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((row) => (
            <tr key={row.id} className="group transition hover:bg-panel2/40">
              <td className="px-5 py-3 align-top">
                <Link href={`/companies/${row.id}`} className="block hover:text-accent">
                  <span className="font-medium text-fg/95">{row.name}</span>
                  {row.ticker && <span className="ml-2 text-xs text-muted tabular">{row.ticker}</span>}
                </Link>
                <div className="mt-1 max-w-xl text-xs leading-5 text-muted">{row.reason}</div>
              </td>
              <td className="px-4 py-3 align-top">
                <AttentionPill level={row.level} label={attentionLabel(row.level)} />
              </td>
              <td className="px-4 py-3 text-right align-top tabular text-fg/70">{row.caseCount.toLocaleString()}</td>
              <td className="px-4 py-3 text-right align-top tabular text-fg/70">{row.recentCases.toLocaleString()}</td>
              <td className="px-4 py-3 text-right align-top">
                <RiskBadge score={row.score} band={row.band} />
              </td>
              <td className="px-3 py-3 align-top text-muted/70 transition group-hover:text-fg/80">
                <Link href={`/companies/${row.id}`} className="inline-block" aria-label={`Open ${row.name}`}>
                  <ArrowUpRight className="size-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      }
    />
  );
}

function RiskTable({ rows, showRecent = false }: { rows: RankedRow[]; showRecent?: boolean }) {
  if (!rows.length) {
    return (
      <div className="py-8 text-center text-sm text-muted">
        No data yet. Run the CourtListener ingest:
        <code className="mt-2 block font-mono text-xs text-fg/80">
          gh workflow run &quot;Ingest CourtListener (weekly)&quot;
        </code>
      </div>
    );
  }
  return (
    <AdaptiveDataList
      mobile={rows.map((row) => (
          <Link
            key={row.id}
            href={`/companies/${row.id}`}
            className="block rounded-lg border border-border/70 bg-panel2/35 p-3 transition hover:border-fg/20 hover:bg-panel2/60"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-fg/95">{row.name}</div>
                {row.ticker && <div className="mt-1 text-xs text-muted tabular">{row.ticker}</div>}
              </div>
              <RiskBadge score={row.score} band={row.band} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <MiniCount label="Cases" value={row.caseCount} />
              {showRecent ? <MiniCount label="12mo" value={row.recentCases} /> : <MiniCount label="Score" value={row.score} />}
            </div>
          </Link>
        ))}
      table={
        <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-border bg-transparent text-xs uppercase tracking-[0.14em] text-muted">
          <tr>
            <th className="px-5 py-2.5 text-left font-normal">Company</th>
            <th className="px-4 py-2.5 text-right font-normal">Cases</th>
            {showRecent && <th className="px-4 py-2.5 text-right font-normal">12mo</th>}
            <th className="px-4 py-2.5 text-right font-normal">Risk</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((row) => (
            <tr key={row.id} className={cn("group transition hover:bg-panel2/40")}>
              <td className="px-5 py-3">
                <Link href={`/companies/${row.id}`} className="block hover:text-accent">
                  <span className="text-fg/95">{row.name}</span>
                  {row.ticker && <span className="ml-2 text-xs text-muted tabular">{row.ticker}</span>}
                </Link>
              </td>
              <td className="px-4 py-3 text-right tabular text-fg/70">{row.caseCount.toLocaleString()}</td>
              {showRecent && (
                <td className="px-4 py-3 text-right tabular text-fg/70">{row.recentCases.toLocaleString()}</td>
              )}
              <td className="px-4 py-3 text-right">
                <RiskBadge score={row.score} band={row.band} />
              </td>
              <td className="px-3 py-3 text-muted/70 transition group-hover:text-fg/80">
                <Link href={`/companies/${row.id}`} className="inline-block" aria-label={`Open ${row.name}`}>
                  <ArrowUpRight className="size-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      }
    />
  );
}

function AttentionPill({ level, label }: { level: AttentionLevel; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        level === "review" && "border-bad/40 bg-bad/10 text-bad",
        level === "monitor" && "border-warn/40 bg-warn/10 text-warn",
        level === "quiet" && "border-ok/30 bg-ok/10 text-ok",
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-75" />
      {label}
    </span>
  );
}

function shortAttentionLabel(level: AttentionLevel): string {
  switch (level) {
    case "review":
      return "Review";
    case "monitor":
      return "Monitor";
    case "quiet":
      return "Quiet";
  }
}

function MiniCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/70 bg-panel/50 px-2 py-2">
      <div className="font-mono text-sm font-semibold tabular">{value.toLocaleString()}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-muted">{label}</div>
    </div>
  );
}

function toAttentionRow(row: CompanySnapshotRow): AttentionRow {
  const driverTypes = extractDriverTypes(row.drivers);
  const input = {
    score: row.score,
    band: row.band,
    delta7d: row.delta7d,
    recentCases: row.recentCases,
    driverTypes,
  };

  return {
    id: row.id,
    name: row.name,
    ticker: row.ticker,
    sectorKey: row.sectorKey,
    sectorLabel: row.sectorLabel,
    caseCount: Number(row.cases),
    score: row.score,
    band: row.band,
    recentCases: row.recentCases,
    delta7d: row.delta7d,
    driverTypes,
    level: attentionLevel(input),
    reason: attentionReason(input),
  };
}

function countLevels(rows: AttentionRow[]): Record<AttentionLevel, number> {
  return rows.reduce(
    (acc, row) => {
      acc[row.level] += 1;
      return acc;
    },
    { review: 0, monitor: 0, quiet: 0 } as Record<AttentionLevel, number>,
  );
}

function levelSort(level: AttentionLevel): number {
  switch (level) {
    case "review":
      return 3;
    case "monitor":
      return 2;
    case "quiet":
      return 1;
  }
}

function extractDriverTypes(drivers: unknown): string[] {
  if (!Array.isArray(drivers)) return [];
  return drivers
    .map((driver: Driver) => driver?.type)
    .filter((type): type is string => typeof type === "string");
}
