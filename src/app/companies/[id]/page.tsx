import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Panel, Stat } from "@/components/Panel";
import { ScoreGauge } from "@/components/ScoreGauge";
import { CaseTimeline } from "@/components/CaseTimeline";
import { formatDate, formatRelative } from "@/lib/utils";
import { ChevronLeft, Gavel, Scale } from "lucide-react";

export const dynamic = "force-dynamic";

async function getCompany(id: string) {
  return prisma.company.findUnique({
    where: { id },
    include: {
      links: {
        include: { caseRef: { include: { judge: true } } },
        orderBy: { caseRef: { dateFiled: "desc" } },
      },
      scores: { orderBy: { computedAt: "desc" }, take: 1 },
      alerts: { take: 8, orderBy: { createdAt: "desc" } },
    },
  });
}

function bucketByMonth(dates: (Date | null)[]): { month: string; count: number }[] {
  const buckets = new Map<string, number>();
  // Seed last 24 months so the chart never collapses to a single bar.
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(k, 0);
  }
  for (const d of dates) {
    if (!d) continue;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  return Array.from(buckets, ([month, count]) => ({
    month: month.slice(2).replace("-", "/"),
    count,
  }));
}

export default async function CompanyPage({ params }: { params: { id: string } }) {
  const co = await getCompany(params.id);
  if (!co) notFound();

  const score = co.scores[0];
  const cases = co.links.map((l) => ({ ...l.caseRef, role: l.role }));
  const timeline = bucketByMonth(cases.map((c) => c.dateFiled));

  // Category breakdown.
  const byNature = new Map<string, number>();
  for (const c of cases) {
    const k = c.natureOfSuit ?? "Other";
    byNature.set(k, (byNature.get(k) ?? 0) + 1);
  }
  const categories = Array.from(byNature, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ChevronLeft className="size-3.5" /> back
      </Link>

      <header className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted">Company</div>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">{co.name}</h1>
          <div className="mt-2 flex items-center gap-3 text-xs text-muted">
            {co.ticker && <span className="rounded border border-border px-1.5 py-0.5 tabular">{co.ticker}</span>}
            <span>{cases.length} cases on record</span>
            {score && <span>· last computed {formatRelative(score.computedAt)}</span>}
          </div>
        </div>
        {score && (
          <div className="shrink-0 rounded-lg border border-border bg-panel px-6 py-4 flex items-center gap-5">
            <ScoreGauge score={score.score} band={score.band} />
            <div className="space-y-1.5 text-xs">
              <FactorBar label="Volume" v={score.volumeFactor} />
              <FactorBar label="Recency" v={score.recencyFactor} />
              <FactorBar label="Severity" v={score.severityFactor} />
            </div>
          </div>
        )}
      </header>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Total cases" value={cases.length} />
        <Stat label="Last 12 months" value={score?.recentCases ?? 0} />
        <Stat
          label="As defendant"
          value={cases.filter((c) => c.role === "defendant").length}
          hint={`${cases.filter((c) => c.role === "plaintiff").length} as plaintiff`}
        />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Panel className="col-span-2" title="Filings — last 24 months" subtitle="Monthly count of new dockets">
          <CaseTimeline data={timeline} />
        </Panel>
        <Panel title="Categories" subtitle="By nature of suit">
          {categories.length === 0 ? (
            <div className="text-sm text-muted">No categorized cases.</div>
          ) : (
            <ul className="space-y-2.5">
              {categories.map((c) => {
                const max = categories[0].count;
                const pct = (c.count / max) * 100;
                return (
                  <li key={c.name} className="text-xs">
                    <div className="flex justify-between mb-1 tabular">
                      <span className="text-fg/80">{c.name}</span>
                      <span className="text-muted">{c.count}</span>
                    </div>
                    <div className="h-1.5 bg-panel2 rounded">
                      <div className="h-full bg-accent/60 rounded" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Cases" subtitle={`${cases.length} dockets, most recent first`}>
        {cases.length === 0 ? (
          <div className="text-sm text-muted">No cases.</div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-panel2 text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="text-left font-normal px-4 py-2">Case</th>
                  <th className="text-left font-normal px-4 py-2">Court</th>
                  <th className="text-left font-normal px-4 py-2">Nature</th>
                  <th className="text-left font-normal px-4 py-2">Role</th>
                  <th className="text-right font-normal px-4 py-2">Filed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cases.slice(0, 100).map((c) => (
                  <tr key={c.id} className="hover:bg-panel2/60">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-fg/90 truncate max-w-[420px]">{c.caseName}</div>
                      <div className="text-[11px] text-muted tabular">{c.docketNumber}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">{c.court ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {c.natureOfSuit ? (
                        <span className="rounded border border-border bg-panel2 px-1.5 py-0.5">{c.natureOfSuit}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="inline-flex items-center gap-1 text-muted">
                        {c.role === "defendant" ? <Gavel className="size-3" /> : <Scale className="size-3" />}
                        {c.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted tabular text-right">{formatDate(c.dateFiled)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cases.length > 100 && (
              <div className="text-center text-xs text-muted py-2 border-t border-border">
                showing first 100 of {cases.length}
              </div>
            )}
          </div>
        )}
      </Panel>

      {co.alerts.length > 0 && (
        <Panel title="Recent alerts">
          <ul className="space-y-2.5">
            {co.alerts.map((a) => {
              const dot = a.severity === "critical" ? "bg-bad" : a.severity === "warn" ? "bg-warn" : "bg-muted";
              return (
                <li key={a.id} className="flex items-start gap-3 text-sm">
                  <span className={`mt-1.5 size-2 rounded-full ${dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3">
                      <span>{a.title}</span>
                      <span className="text-xs text-muted">{formatRelative(a.createdAt)}</span>
                    </div>
                    <div className="text-xs text-muted">{a.body}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function FactorBar({ label, v }: { label: string; v: number }) {
  const pct = Math.round(v * 100);
  return (
    <div className="flex items-center gap-2 w-44">
      <span className="w-16 text-muted">{label}</span>
      <div className="flex-1 h-1 bg-panel2 rounded">
        <div className="h-full bg-accent/70 rounded" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right tabular text-fg/80">{pct}</span>
    </div>
  );
}
