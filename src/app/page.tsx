import Link from "next/link";
import { prisma } from "@/lib/db";
import { Panel, Stat } from "@/components/Panel";
import { RiskBadge } from "@/components/RiskBadge";
import { MoversPanel, type MoverRow } from "@/components/MoversPanel";
import { formatRelative } from "@/lib/utils";
import { ArrowUpRight, Bell, TrendingUp } from "lucide-react";

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
        scoreVersion: "v2",
      },
      orderBy: { computedAt: "desc" },
      take: 1000,
      include: { company: { select: { id: true, name: true, ticker: true } } },
    }),
  ]);

  const ranked = companies.map((c) => ({
    id: c.id,
    name: c.name,
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
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted mt-1">Litigation signal across the watched universe.</p>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Companies tracked" value={data.totals.companies.toLocaleString()} />
        <Stat label="Cases ingested" value={data.totals.cases.toLocaleString()} />
        <Stat label="Active alerts" value={data.totals.alerts.toLocaleString()} hint="last 30 days" />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Panel
          title="Highest risk"
          subtitle="Top scores from latest snapshot"
          className="col-span-2"
        >
          <RiskTable rows={data.topRisk} />
        </Panel>

        <div className="space-y-6">
          <MoversPanel rows={data.movers} />
          <Panel title="Recent alerts" right={<Link href="/alerts" className="text-xs text-muted hover:text-fg">view all →</Link>}>
            <ul className="space-y-3">
              {data.alerts.length === 0 && <li className="text-sm text-muted">Nothing new — quiet day.</li>}
              {data.alerts.map((a) => (
                <li key={a.id}>
                  <Link href={`/companies/${a.company.id}`} className="block group">
                    <div className="flex items-start gap-2.5">
                      <Bell className={`size-3.5 mt-1 ${a.severity === "critical" ? "text-bad" : a.severity === "warn" ? "text-warn" : "text-muted"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-muted">{a.company.name} · {formatRelative(a.createdAt)}</div>
                        <div className="text-sm group-hover:text-accent truncate">{a.title}</div>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <Panel
        title="Trending — most filings (last 12 months)"
        subtitle="Companies with the highest recent case volume"
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

function RiskTable({ rows, showRecent = false }: { rows: Array<{ id: string; name: string; caseCount: number; score: number; band: string; recentCases: number }>; showRecent?: boolean }) {
  if (!rows.length) {
    return (
      <div className="text-sm text-muted py-6 text-center">
        No data yet. Run the CourtListener ingest to load real dockets:
        <code className="text-fg block mt-1">npm run fetch:courtlistener && npm run ingest -- --file /tmp/dockets.jsonl && npm run risk</code>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-panel2 text-[11px] uppercase tracking-wider text-muted">
          <tr>
            <th className="text-left font-normal px-4 py-2">Company</th>
            <th className="text-right font-normal px-4 py-2">Cases</th>
            {showRecent && <th className="text-right font-normal px-4 py-2">Last 12mo</th>}
            <th className="text-right font-normal px-4 py-2">Risk</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-panel2/60 transition">
              <td className="px-4 py-2.5">
                <Link href={`/companies/${r.id}`} className="hover:text-accent">{r.name}</Link>
              </td>
              <td className="px-4 py-2.5 text-right tabular text-fg/80">{r.caseCount}</td>
              {showRecent && <td className="px-4 py-2.5 text-right tabular text-fg/80">{r.recentCases}</td>}
              <td className="px-4 py-2.5 text-right">
                <RiskBadge score={r.score} band={r.band} />
              </td>
              <td className="px-3 py-2.5 text-muted">
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
