import Link from "next/link";
import { prisma } from "@/lib/db";
import { Panel } from "@/components/Panel";
import { RiskBadge } from "@/components/RiskBadge";
import { MoversPanel, type MoverRow } from "@/components/MoversPanel";
import { formatRelative, cn } from "@/lib/utils";
import { ArrowUpRight, Bell, TrendingUp, Briefcase, FileText, BellRing } from "lucide-react";

export const dynamic = "force-dynamic";

async function getData() {
  const [companies, alerts, totals, moverSnapshots] = await Promise.all([
    prisma.company.findMany({
      include: {
        scores: { orderBy: { computedAt: "desc" }, take: 1 },
        _count: { select: { links: true } },
      },
    }),
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

  const ranked = companies.map((c) => ({
    id: c.id,
    name: c.name,
    ticker: c.ticker,
    caseCount: c._count.links,
    score: c.scores[0]?.score ?? 0,
    band: c.scores[0]?.band ?? "low",
    recentCases: c.scores[0]?.recentCases ?? 0,
  }));
  const topRisk = [...ranked].sort((a, b) => b.score - a.score).slice(0, 8);
  const trending = [...ranked].sort((a, b) => b.recentCases - a.recentCases).slice(0, 8);

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
    topRisk,
    trending,
    alerts,
    movers,
  };
}

export default async function DashboardPage() {
  const data = await getData();

  return (
    <div className="space-y-8 animate-fade-in">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Overview</div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight mt-1.5">
            Litigation pulse, scored.
          </h1>
          <p className="text-sm text-muted mt-2 max-w-xl leading-relaxed">
            Real-time risk signal across federal civil litigation. Ranked by v3 methodology —
            volume, recency, severity, momentum, concentration, jurisdiction, judge.
          </p>
        </div>
        <Link
          href="/api"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-accent border border-border rounded-md px-3 py-1.5"
        >
          API reference →
        </Link>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi
          label="Companies tracked"
          value={data.totals.companies.toLocaleString()}
          icon={<Briefcase className="size-4" />}
        />
        <Kpi
          label="Cases ingested"
          value={data.totals.cases.toLocaleString()}
          icon={<FileText className="size-4" />}
        />
        <Kpi
          label="Active alerts"
          value={data.totals.alerts.toLocaleString()}
          icon={<BellRing className="size-4" />}
          hint="last 30 days"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel
          title="Highest risk"
          subtitle="Top scores from latest snapshot"
          className="lg:col-span-2"
        >
          <RiskTable rows={data.topRisk} />
        </Panel>

        <div className="space-y-6">
          <MoversPanel rows={data.movers} />
          <Panel
            title="Recent alerts"
            right={
              <Link href="/alerts" className="text-xs text-muted hover:text-fg">
                view all →
              </Link>
            }
          >
            <ul className="space-y-3">
              {data.alerts.length === 0 && (
                <li className="text-sm text-muted">Nothing new — quiet day.</li>
              )}
              {data.alerts.map((a) => {
                const sev =
                  a.severity === "critical"
                    ? "text-bad"
                    : a.severity === "warn"
                      ? "text-warn"
                      : "text-muted";
                return (
                  <li key={a.id}>
                    <Link href={`/companies/${a.company.id}`} className="block group -mx-1 px-1 py-1 rounded hover:bg-panel2/40 transition">
                      <div className="flex items-start gap-2.5">
                        <Bell className={`size-3.5 mt-1 shrink-0 ${sev}`} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] text-muted tabular">
                            {a.company.name} · {formatRelative(a.createdAt)}
                          </div>
                          <div className="text-sm group-hover:text-accent truncate transition">
                            {a.title}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      </div>

      <Panel
        title="Trending"
        subtitle="Companies with the highest recent case volume (last 12 months)"
        right={
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <TrendingUp className="size-3.5" /> recency-weighted
          </span>
        }
      >
        <RiskTable rows={data.trending} showRecent />
      </Panel>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-panel/60 p-5 transition hover:bg-panel/80">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-muted">
        <span>{label}</span>
        <span className="text-muted/60">{icon}</span>
      </div>
      <div className="mt-3 font-display text-3xl font-semibold tabular tracking-tight">{value}</div>
      {hint && <div className="text-[11px] text-muted mt-1.5">{hint}</div>}
    </div>
  );
}

type RankedRow = {
  id: string;
  name: string;
  ticker?: string | null;
  caseCount: number;
  score: number;
  band: string;
  recentCases: number;
};

function RiskTable({ rows, showRecent = false }: { rows: RankedRow[]; showRecent?: boolean }) {
  if (!rows.length) {
    return (
      <div className="text-sm text-muted py-8 text-center">
        No data yet. Run the CourtListener ingest:
        <code className="text-fg/80 block mt-2 font-mono text-[11px]">
          gh workflow run &quot;Ingest CourtListener (weekly)&quot;
        </code>
      </div>
    );
  }
  return (
    <div className="overflow-hidden -mx-5 -mb-5">
      <table className="w-full text-sm">
        <thead className="bg-transparent text-[11px] uppercase tracking-[0.14em] text-muted border-b border-border">
          <tr>
            <th className="text-left font-normal px-5 py-2.5">Company</th>
            <th className="text-right font-normal px-4 py-2.5">Cases</th>
            {showRecent && <th className="text-right font-normal px-4 py-2.5">12mo</th>}
            <th className="text-right font-normal px-4 py-2.5">Risk</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((r) => (
            <tr key={r.id} className={cn("hover:bg-panel2/40 transition group")}>
              <td className="px-5 py-3">
                <Link href={`/companies/${r.id}`} className="hover:text-accent block">
                  <span className="text-fg/95">{r.name}</span>
                  {r.ticker && (
                    <span className="text-muted ml-2 tabular text-[11px]">{r.ticker}</span>
                  )}
                </Link>
              </td>
              <td className="px-4 py-3 text-right tabular text-fg/70">{r.caseCount.toLocaleString()}</td>
              {showRecent && <td className="px-4 py-3 text-right tabular text-fg/70">{r.recentCases.toLocaleString()}</td>}
              <td className="px-4 py-3 text-right">
                <RiskBadge score={r.score} band={r.band} />
              </td>
              <td className="px-3 py-3 text-muted/70 group-hover:text-fg/80 transition">
                <Link href={`/companies/${r.id}`} className="inline-block">
                  <ArrowUpRight className="size-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
