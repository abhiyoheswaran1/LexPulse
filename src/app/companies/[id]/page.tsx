import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Panel } from "@/components/Panel";
import { RiskBadge } from "@/components/RiskBadge";
import { ScoreGauge } from "@/components/ScoreGauge";
import { ScoreHistoryChart, type ScoreHistoryPoint } from "@/components/ScoreHistoryChart";
import { CaseTimeline } from "@/components/CaseTimeline";
import { DriversPanel, type Driver } from "@/components/DriversPanel";
import { BenchmarkPanel } from "@/components/BenchmarkPanel";
import { WatchlistButton } from "@/components/workflow/WatchlistButton";
import { SourceLink } from "@/components/ui/SourceLink";
import { MetricStrip } from "@/components/ui/MetricStrip";
import { formatDate, formatRelative, cn, courtListenerUrl } from "@/lib/utils";
import { ChevronLeft, Gavel, Scale, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { deriveSubScores, type RiskBreakdownV3 } from "@/lib/risk";
import { attentionLabel, attentionLevel, attentionReason, type AttentionLevel } from "@/lib/simple-ui";

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
      scores: { orderBy: { computedAt: "desc" }, take: 24 },
      alerts: { take: 8, orderBy: { createdAt: "desc" } },
    },
  });
}

async function getSectorPeers(sectorKey: string | null, companyId: string) {
  if (!sectorKey) return [];
  const peers = await prisma.company.findMany({
    where: { sectorKey, NOT: { id: companyId } },
    take: 40,
    include: {
      scores: { orderBy: { computedAt: "desc" }, take: 1 },
      _count: { select: { links: true } },
    },
  });

  return peers
    .map((peer) => ({
      id: peer.id,
      name: peer.name,
      ticker: peer.ticker,
      caseCount: peer._count.links,
      score: peer.scores[0]?.score ?? 0,
      band: peer.scores[0]?.band ?? "low",
      recentCases: peer.scores[0]?.recentCases ?? 0,
      delta7d: peer.scores[0]?.delta7d ?? null,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
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
  const peers = await getSectorPeers(co.sectorKey, co.id);

  const score = co.scores[0];
  const cases = co.links.map((l) => ({ ...l.caseRef, role: l.role }));
  const casesById = new Map(cases.map((caseRef) => [caseRef.id, caseRef]));
  const timeline = bucketByMonth(cases.map((c) => c.dateFiled));
  const drivers = extractDrivers(score?.drivers);
  const driverTypes = drivers.map((driver) => driver.type).filter((type): type is string => typeof type === "string");
  const attention =
    score &&
    attentionLevel({
      score: score.score,
      band: score.band,
      delta7d: score.delta7d,
      recentCases: score.recentCases,
      driverTypes,
    });
  const reviewReason =
    score &&
    attentionReason({
      score: score.score,
      band: score.band,
      delta7d: score.delta7d,
      recentCases: score.recentCases,
      driverTypes,
    });

  // v3.1 sub-scoring views derived from the persisted RiskScore. Only
  // computed for v3 snapshots (older versions don't have all factors).
  const subScores =
    score && score.scoreVersion === "v3"
      ? deriveSubScores({
          score: score.score,
          band: score.band as RiskBreakdownV3["band"],
          volumeFactor: score.volumeFactor,
          recencyFactor: score.recencyFactor,
          severityFactor: score.severityFactor,
          momentumFactor: score.momentumFactor,
          concentrationFactor: score.concentrationFactor,
          jurisdictionFactor: score.jurisdictionFactor,
          judgeFactor: score.judgeFactor,
          firmSignalFactor: score.firmSignalFactor,
          similaritySignalFactor: score.similaritySignalFactor,
          scoreVersion: "v3",
          caseCount: score.caseCount,
          recentCases: score.recentCases,
          recent30: 0,
          baselineMonthly: 0,
          topCategory: null,
          topCategoryShare: 0,
          topCircuit: null,
          topCircuitShare: 0,
          meanJudgeDismissal: null,
          judgeSampleSize: 0,
        })
      : null;

  const byNature = new Map<string, number>();
  for (const c of cases) {
    const k = c.natureOfSuit ?? "Other";
    byNature.set(k, (byNature.get(k) ?? 0) + 1);
  }
  const categories = Array.from(byNature, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const scoreHistory: ScoreHistoryPoint[] = [...co.scores]
    .reverse()
    .map((item) => ({
      label: `${item.computedAt.getMonth() + 1}/${String(item.computedAt.getDate()).padStart(2, "0")}`,
      score: item.score,
      band: item.band,
    }));
  const changeEvents = co.scores.slice(0, 8).map((item, index) => {
    const prior = co.scores[index + 1];
    const delta = prior ? item.score - prior.score : item.delta7d;
    const itemDrivers = extractDrivers(item.drivers);
    return {
      id: item.id,
      computedAt: item.computedAt,
      score: item.score,
      band: item.band,
      delta,
      driver: itemDrivers[0]?.label ?? null,
    };
  });

  return (
    <div className="space-y-8 animate-fade-in">
      <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ChevronLeft className="size-3.5" /> back
      </Link>

      {/* Hero: single flat surface containing identity + score gauge + factor
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
              {score && <span>Computed {formatRelative(score.computedAt)}</span>}
              <WatchlistButton id={co.id} name={co.name} ticker={co.ticker} compact />
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
                      "-"
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
              <div className="space-y-3">
                <ScoreGauge score={score.score} band={score.band} />
                {subScores && (
                  <div className="grid grid-cols-2 gap-2 text-center font-mono">
                    <SubScorePill label="Structural" value={subScores.structural} hint="stable risk" />
                    <SubScorePill label="Current" value={subScores.momentum} hint="30d spike" />
                  </div>
                )}
              </div>
              <FactorList score={score} />
            </div>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.85fr] gap-6">
        <Panel title="Why did this change?" subtitle="Recent score movement and primary driver at each snapshot.">
          <ul className="space-y-3">
            {changeEvents.length === 0 ? (
              <li className="text-sm text-muted">No historical score movement yet.</li>
            ) : (
              changeEvents.map((event) => (
                <li key={event.id} className="rounded-lg border border-border bg-panel2/40 p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium">Score {event.score}</div>
                      <div className="mt-1 text-xs text-muted">{formatRelative(event.computedAt)}</div>
                    </div>
                    <DeltaBadge value={event.delta} />
                  </div>
                  <div className="mt-2 text-xs leading-5 text-muted">
                    {event.driver ?? `Band is ${event.band}; no dominant driver was recorded for this snapshot.`}
                  </div>
                </li>
              ))
            )}
          </ul>
        </Panel>
        <Panel title="Score history" subtitle="Latest persisted score snapshots for this company.">
          <ScoreHistoryChart data={scoreHistory} />
        </Panel>
      </div>

      {score && (
        <Panel
          title="Review summary"
          subtitle="Plain-language triage derived from score movement, recent cases, drivers, and peer context."
        >
          <div className="space-y-5">
            <div className="max-w-3xl">
              {attention && <AttentionPill level={attention} label={attentionLabel(attention)} />}
              {reviewReason && <p className="mt-3 text-sm leading-6 text-fg/85">{reviewReason}</p>}
              {drivers.length > 0 && (
                <div className="mt-3 text-xs text-muted">
                  Top driver: <span className="text-fg/80">{drivers[0].label}</span>
                </div>
              )}
            </div>
            <MetricStrip
              columns={4}
              items={[
                { label: "Score", value: score.score },
                { label: "12mo", value: (score.recentCases ?? 0).toLocaleString() },
                { label: "7d", value: score.delta7d == null ? "flat" : <DeltaValue value={score.delta7d} /> },
                {
                  label: "Last change",
                  value: changeEvents[0]?.delta == null ? "flat" : <DeltaValue value={changeEvents[0].delta} />,
                  hint: changeEvents[0]?.driver ?? "No dominant driver",
                },
              ]}
            />
          </div>
        </Panel>
      )}

      <Panel title="Data confidence" subtitle="Entity and sector matching signals used by the product.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ConfidenceItem
            label="Sector match"
            value={co.sectorConfidence == null ? "Unknown" : `${Math.round(co.sectorConfidence * 100)}%`}
            hint={co.sectorSource ? `Source: ${co.sectorSource}` : "No sector source recorded"}
          />
          <ConfidenceItem
            label="SEC identity"
            value={co.cik ? "CIK linked" : "No CIK"}
            hint={co.cik ? `CIK ${co.cik}` : "Private, foreign, or unmatched public company"}
          />
          <ConfidenceItem
            label="Entity key"
            value="Normalized"
            hint="Company and party names are resolved through a normalized key."
          />
        </div>
      </Panel>

      {score && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DriversPanel drivers={drivers} />
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

      <Panel
        title="Sector peers"
        subtitle={co.sector?.label ? `Highest-scoring peers in ${co.sector.label}.` : "No sector peer cohort is available yet."}
      >
        {peers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
            Peer comparison will appear once this company has a mapped sector cohort.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {peers.map((peer) => (
              <Link
                key={peer.id}
                href={`/companies/${peer.id}`}
                className="rounded-lg border border-border/75 bg-panel2/35 p-3 transition hover:border-fg/20 hover:bg-panel2/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-fg/95">{peer.name}</div>
                    <div className="mt-1 text-xs text-muted">
                      {peer.caseCount.toLocaleString()} cases, {peer.recentCases.toLocaleString()} recent
                    </div>
                  </div>
                  <RiskBadge score={peer.score} band={peer.band} />
                </div>
                {peer.delta7d != null && peer.delta7d !== 0 && (
                  <div className="mt-3 text-xs text-muted">
                    7d move: <DeltaValue value={peer.delta7d} />
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel className="lg:col-span-2" title="Filings, last 24 months" subtitle="Monthly count of new dockets">
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
        subtitle={`${cases.length.toLocaleString()} dockets, most recent first. Click any linked row to view on CourtListener.`}
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
                  const clUrl = courtListenerUrl(c.sourceId ?? null, c.caseName);
                  // Render the row as an anchor when we have a source id;
                  // wrap in <tr> for layout via display:contents-equivalent.
                  return (
                    <tr
                      key={c.id}
                      className={
                        clUrl
                          ? "group hover:bg-panel2/60 transition cursor-pointer"
                          : "hover:bg-panel2/40 transition"
                      }
                    >
                      <td className="px-4 py-3">
                        {clUrl ? (
                          <Link
                            href={clUrl}
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
                      <td className="px-4 py-3 text-xs text-muted tabular">{c.court ?? "-"}</td>
                      <td className="px-4 py-3 text-xs">
                        {c.natureOfSuit ? (
                          <span className="rounded-md border border-border bg-panel2 px-2 py-0.5 text-xs">
                            {c.natureOfSuit}
                          </span>
                        ) : (
                          <span className="text-muted">-</span>
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
                        <SourceLink href={clUrl} label="Docket" compact />
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
              const alertCaseId = extractCaseId(a.refs);
              const alertCase = alertCaseId ? casesById.get(alertCaseId) : null;
              const sourceUrl = alertCase ? courtListenerUrl(alertCase.sourceId ?? null, alertCase.caseName) : null;
              return (
                <li key={a.id} className="flex items-start gap-3 text-sm">
                  <span className={`mt-1.5 size-2 rounded-full ${dot}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3">
                      <span>{a.title}</span>
                      <span className="text-xs text-muted">{formatRelative(a.createdAt)}</span>
                    </div>
                    <div className="text-xs text-muted">{a.body}</div>
                    {sourceUrl && (
                      <SourceLink href={sourceUrl} label="Source docket" className="mt-2" />
                    )}
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

function SubScorePill({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-md border border-border bg-panel/40 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted font-sans">{label}</div>
      <div className="text-2xl tabular font-semibold tracking-tight mt-0.5">{value}</div>
      <div className="text-[10px] text-muted mt-0.5 font-sans">{hint}</div>
    </div>
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

function DeltaBadge({ value }: { value: number | null }) {
  if (value == null || value === 0) {
    return <span className="rounded-md border border-border px-2 py-1 text-xs text-muted">flat</span>;
  }

  const up = value > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium",
        up ? "border-bad/40 bg-bad/10 text-bad" : "border-ok/40 bg-ok/10 text-ok",
      )}
    >
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {up ? "+" : ""}
      {value}
    </span>
  );
}

function ConfidenceItem({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel2/40 p-4">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
      <div className="mt-1 text-xs leading-5 text-muted">{hint}</div>
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
      raw: score.jurisdictionFactor.toFixed(2) + "x",
    });
  }
  if (score.judgeFactor != null) {
    rows.push({
      label: "Judge",
      v: Math.min(1, Math.max(0, (score.judgeFactor - 0.92) / 0.18)),
      raw: score.judgeFactor.toFixed(2) + "x",
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

function extractDrivers(drivers: unknown): Driver[] {
  if (!Array.isArray(drivers)) return [];
  return drivers.filter((driver): driver is Driver => typeof driver === "object" && driver !== null);
}

function extractCaseId(refs: unknown): string | null {
  if (!refs || typeof refs !== "object") return null;
  const candidate = refs as { caseId?: unknown };
  return typeof candidate.caseId === "string" ? candidate.caseId : null;
}
