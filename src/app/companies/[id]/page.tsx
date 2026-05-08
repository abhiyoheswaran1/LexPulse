import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Panel } from "@/components/Panel";
import { ScoreGauge } from "@/components/ScoreGauge";
import { CaseTimeline } from "@/components/CaseTimeline";
import { DriversPanel, type Driver } from "@/components/DriversPanel";
import { BenchmarkPanel } from "@/components/BenchmarkPanel";
import { formatDate, formatRelative, cn } from "@/lib/utils";
import { ChevronLeft, Gavel, Scale, ArrowDownRight, ArrowUpRight, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

async function getCompany(id: string) {
  return prisma.company.findUnique({
    where: { id },
    include: {
      sector: { select: { label: true } },
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

  const byNature = new Map<string, number>();
  for (const c of cases) {
    const k = c.natureOfSuit ?? "Other";
    byNature.set(k, (byNature.get(k) ?? 0) + 1);
  }
  const categories = Array.from(byNature, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <div className="space-y-8 animate-fade-in">
      <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ChevronLeft className="size-3.5" /> back
      </Link>

      {/* Hero — single flat surface containing identity + score gauge + factor
          stack. Avoids the nested-card visual that the old layout had. */}
      <header className="rounded-xl border border-border bg-panel/60 p-7">
        <div className="flex items-start justify-between gap-8 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-[0.18em] text-muted">Company</div>
            <h1 className="font-display text-4xl font-semibold tracking-tight mt-2 leading-[1.05]">
              {co.name}
            </h1>
            <div className="mt-4 flex items-center gap-3 flex-wrap text-xs text-muted">
              {co.ticker && (
                <span className="rounded-md border border-border bg-panel2 px-2 py-1 tabular text-fg/80 text-xs">
                  {co.ticker}
                </span>
              )}
              {co.sector?.label && (
                <span className="rounded-full border border-border px-2.5 py-0.5 text-xs">
                  {co.sector.label}
                </span>
              )}
              <span>{cases.length.toLocaleString()} cases on record</span>
              {score && <span aria-hidden>·</span>}
              {score && <span>computed {formatRelative(score.computedAt)}</span>}
            </div>

            {score && (
              <dl className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-4">
                <Metric label="Total cases" value={cases.length.toLocaleString()} />
                <Metric label="Last 12 months" value={(score.recentCases ?? 0).toLocaleString()} />
                <Metric
                  label="As defendant"
                  value={cases.filter((c) => c.role === "defendant").length.toLocaleString()}
                  hint={`${cases.filter((c) => c.role === "plaintiff").length} as plaintiff`}
                />
                <Metric
                  label="7d change"
                  value={
                    score.delta7d == null ? (
                      "—"
                    ) : (
                      <DeltaValue value={score.delta7d} />
                    )
                  }
                />
              </dl>
            )}
          </div>

          {score && (
            <div className="flex items-start gap-8">
              <ScoreGauge score={score.score} band={score.band} />
              <FactorList score={score} />
            </div>
          )}
        </div>
      </header>

      {score && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DriversPanel drivers={(score.drivers as unknown as Driver[]) ?? []} />
          <BenchmarkPanel
            score={score.score}
            benchmark={
              score.percentile != null
                ? {
                    sector: co.sectorKey,
                    sector_label: co.sector?.label ?? null,
                    cohort_size: score.cohortSize,
                    percentile: score.percentile,
                    sector_median: score.cohortP50,
                    z_score: score.zScore,
                  }
                : null
            }
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel className="lg:col-span-2" title="Filings — last 24 months" subtitle="Monthly count of new dockets">
          <CaseTimeline data={timeline} />
        </Panel>
        <Panel title="Categories" subtitle="By nature of suit">
          {categories.length === 0 ? (
            <div className="text-sm text-muted">No categorized cases.</div>
          ) : (
            <ul className="space-y-3">
              {categories.map((c) => {
                const max = categories[0].count;
                const pct = (c.count / max) * 100;
                return (
                  <li key={c.name} className="text-xs">
                    <div className="flex justify-between mb-1.5">
                      <span className="text-fg/80 truncate pr-2">{c.name}</span>
                      <span className="text-muted tabular">{c.count}</span>
                    </div>
                    <div className="relative h-1 bg-panel2 rounded-full overflow-hidden">
                      <div
                        className="absolute inset-0 bg-gradient-to-r from-accent/80 to-accent/40 rounded-full origin-left"
                        style={{ transform: `scaleX(${Math.max(0, Math.min(1, pct / 100))})` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Cases"
        subtitle={`${cases.length.toLocaleString()} dockets, most recent first · click any row to view on CourtListener`}
      >
        {cases.length === 0 ? (
          <div className="text-sm text-muted">No cases.</div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-panel2 text-xs uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="text-left font-normal px-4 py-2.5">Case</th>
                  <th className="text-left font-normal px-4 py-2.5">Court</th>
                  <th className="text-left font-normal px-4 py-2.5">Nature</th>
                  <th className="text-left font-normal px-4 py-2.5">Role</th>
                  <th className="text-right font-normal px-4 py-2.5">Filed</th>
                  <th className="w-10" aria-label="external link" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {cases.slice(0, 100).map((c) => {
                  const courtListenerUrl = c.sourceId
                    ? `https://www.courtlistener.com/docket/${c.sourceId}/`
                    : null;
                  const RowTag = courtListenerUrl ? "a" : "tr";
                  // Render the row as an anchor when we have a source id;
                  // wrap in <tr> for layout via display:contents-equivalent.
                  return (
                    <tr
                      key={c.id}
                      className={
                        courtListenerUrl
                          ? "group hover:bg-panel2/60 transition cursor-pointer"
                          : "hover:bg-panel2/40 transition"
                      }
                    >
                      <td className="px-4 py-3">
                        {courtListenerUrl ? (
                          <Link
                            href={courtListenerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block group-hover:text-accent transition"
                          >
                            <div className="font-medium text-fg/90 truncate max-w-[420px] group-hover:text-accent">
                              {c.caseName}
                            </div>
                            <div className="text-xs text-muted tabular mt-0.5">{c.docketNumber}</div>
                          </Link>
                        ) : (
                          <>
                            <div className="font-medium text-fg/90 truncate max-w-[420px]">{c.caseName}</div>
                            <div className="text-xs text-muted tabular mt-0.5">{c.docketNumber}</div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted tabular">{c.court ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">
                        {c.natureOfSuit ? (
                          <span className="rounded-md border border-border bg-panel2 px-2 py-0.5 text-xs">
                            {c.natureOfSuit}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-muted">
                          {c.role === "defendant" ? <Gavel className="size-3" /> : <Scale className="size-3" />}
                          {c.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted tabular text-right">{formatDate(c.dateFiled)}</td>
                      <td className="px-3 py-3 text-muted/60 group-hover:text-accent transition">
                        {courtListenerUrl && (
                          <Link
                            href={courtListenerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Open on CourtListener"
                          >
                            <ExternalLink className="size-3.5" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {cases.length > 100 && (
              <div className="text-center text-xs text-muted py-2 border-t border-border">
                showing first 100 of {cases.length.toLocaleString()}
              </div>
            )}
          </div>
        )}
      </Panel>

      {co.alerts.length > 0 && (
        <Panel title="Recent alerts">
          <ul className="space-y-3">
            {co.alerts.map((a) => {
              const dot =
                a.severity === "critical" ? "bg-bad" : a.severity === "warn" ? "bg-warn" : "bg-muted";
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

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="mt-1.5 text-xl font-semibold tabular tracking-tight text-fg">{value}</div>
      {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
    </div>
  );
}

function DeltaValue({ value }: { value: number }) {
  if (value === 0) return <span className="text-muted">flat</span>;
  const Up = value > 0;
  return (
    <span className={cn("inline-flex items-center gap-1", Up ? "text-bad" : "text-ok")}>
      {Up ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
      <span className="tabular">{Up ? "+" : ""}{value}</span>
    </span>
  );
}

type ScoreRow = {
  volumeFactor: number;
  recencyFactor: number;
  severityFactor: number;
  momentumFactor: number | null;
  concentrationFactor: number | null;
  jurisdictionFactor: number | null;
  judgeFactor: number | null;
};

function FactorList({ score }: { score: ScoreRow }) {
  const rows: Array<{ label: string; v: number; raw?: string }> = [
    { label: "Volume", v: score.volumeFactor },
    { label: "Recency", v: score.recencyFactor },
    { label: "Severity", v: score.severityFactor },
  ];
  if (score.momentumFactor != null) rows.push({ label: "Momentum", v: score.momentumFactor });
  if (score.concentrationFactor != null) rows.push({ label: "Concentration", v: score.concentrationFactor });
  if (score.jurisdictionFactor != null) {
    rows.push({
      label: "Jurisdiction",
      v: Math.min(1, Math.max(0, (score.jurisdictionFactor - 0.85) / 0.3)),
      raw: score.jurisdictionFactor.toFixed(2) + "×",
    });
  }
  if (score.judgeFactor != null) {
    rows.push({
      label: "Judge",
      v: Math.min(1, Math.max(0, (score.judgeFactor - 0.92) / 0.18)),
      raw: score.judgeFactor.toFixed(2) + "×",
    });
  }
  return (
    <ul className="w-56 space-y-2 text-xs">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[88px_1fr_44px] items-center gap-2">
          <span className="text-muted">{r.label}</span>
          <div className="relative h-1 bg-panel2 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-accent to-accent/40 rounded-full origin-left transition-transform duration-700"
              style={{ transform: `scaleX(${Math.max(0, Math.min(1, r.v))})` }}
            />
          </div>
          <span className="text-fg/80 tabular text-right text-xs">
            {r.raw ?? Math.round(r.v * 100)}
          </span>
        </li>
      ))}
    </ul>
  );
}
