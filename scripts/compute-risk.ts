// Recompute per-company risk scores and generate alerts (v3).
//
// Two-pass:
//   Pass 1 — compute v3 breakdown + drivers per company; accumulate
//            { sectorKey: scores[] } in memory.
//   Pass 2 — compute benchmarks per company against accumulated cohort;
//            persist enriched RiskScore snapshot; emit alerts.
//
// Idempotent on alerts: dedup by case id (new_case) and 24h (case_spike).

import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import {
  computeRiskV3,
  type CaseLiteV3,
  type RiskBreakdownV3,
} from "../src/lib/risk";
import { generateDrivers, type DriverSnapshot, type NewCase } from "../src/lib/drivers";
import { computeBenchmark } from "../src/lib/benchmarks";
import type { JudgeProfileLite } from "../src/lib/judges";
import { hasRecentEquivalentAlert } from "../src/lib/alert-dedupe";

const ONE_DAY = 86400000;

type CompanyRow = Awaited<ReturnType<typeof loadCompanies>>[number];

async function loadCompanies(now: Date) {
  const oneDayAgo = new Date(now.getTime() - ONE_DAY);
  return prisma.company.findMany({
    select: {
      id: true,
      name: true,
      sectorKey: true,
      links: {
        select: {
          caseRef: {
            select: {
              id: true,
              dateFiled: true,
              natureOfSuit: true,
              caseName: true,
              court: true,
              judgeId: true,
            },
          },
        },
      },
      scores: {
        orderBy: { computedAt: "desc" },
        take: 100, // headroom for delta lookups even with multiple-runs-per-day
      },
      alerts: {
        where: {
          OR: [
            { type: "new_case" },
            { type: "risk_jump", createdAt: { gte: oneDayAgo } },
            { type: "case_spike", createdAt: { gte: oneDayAgo } },
          ],
        },
        select: { type: true, refs: true, createdAt: true },
        take: 400,
      },
    },
  });
}

async function loadJudgeProfiles(): Promise<Map<string, JudgeProfileLite>> {
  const rows = await prisma.judgeProfile.findMany({
    select: { judgeId: true, dismissalRate: true, caseCount: true },
  });
  const map = new Map<string, JudgeProfileLite>();
  for (const r of rows) {
    map.set(r.judgeId, { dismissalRate: r.dismissalRate, caseCount: r.caseCount });
  }
  return map;
}

function pass1(
  co: CompanyRow,
  judgeProfiles: Map<string, JudgeProfileLite>,
  now: Date,
): { v3: RiskBreakdownV3; cases: CaseLiteV3[]; cases12moTotal: number } {
  const cases: CaseLiteV3[] = co.links.map((l) => ({
    dateFiled: l.caseRef.dateFiled,
    natureOfSuit: l.caseRef.natureOfSuit,
    court: l.caseRef.court,
    judgeId: l.caseRef.judgeId,
  }));
  const v3 = computeRiskV3(cases, judgeProfiles, now);
  let cases12moTotal = 0;
  for (const c of cases) {
    if (!c.dateFiled) continue;
    const age = now.getTime() - c.dateFiled.getTime();
    if (age < 0 || age > 365 * 86400000) continue;
    cases12moTotal++;
  }
  return { v3, cases, cases12moTotal };
}

// Returns the score from the most recent snapshot at-or-before (now - n days),
// filtered to a specific scoreVersion so v1↔v3 cross-version comparisons don't
// leak into delta computation.
function findScoreNDaysAgo(
  scores: CompanyRow["scores"],
  n: number,
  now: Date,
  version: string,
): number | null {
  const cutoff = new Date(now.getTime() - n * ONE_DAY);
  for (const s of scores) {
    if (s.scoreVersion !== version) continue;
    if (s.computedAt <= cutoff) return s.score;
  }
  return null;
}

async function main() {
  const now = new Date();
  const [companies, judgeProfiles] = await Promise.all([
    loadCompanies(now),
    loadJudgeProfiles(),
  ]);

  // --- Pass 1 ---
  const computed: Array<{
    co: CompanyRow;
    v3: RiskBreakdownV3;
    cases: CaseLiteV3[];
    cases12moTotal: number;
  }> = [];
  const sectorScores: Map<string, number[]> = new Map();
  for (const co of companies) {
    const { v3, cases, cases12moTotal } = pass1(co, judgeProfiles, now);
    computed.push({ co, v3, cases, cases12moTotal });
    if (co.sectorKey) {
      const arr = sectorScores.get(co.sectorKey) ?? [];
      arr.push(v3.score);
      sectorScores.set(co.sectorKey, arr);
    }
  }

  // --- Pass 2 ---
  // Build a per-company index into the sector cohort so we can exclude *this*
  // company's score (and not just any tied-score peer's) when benchmarking.
  const sectorIndex: Map<string, Map<string, number>> = new Map();
  for (const { co } of computed) {
    if (!co.sectorKey) continue;
    let inner = sectorIndex.get(co.sectorKey);
    if (!inner) {
      inner = new Map();
      sectorIndex.set(co.sectorKey, inner);
    }
    inner.set(co.id, inner.size);
  }

  // Batched-write buffers. Per-row `prisma.riskScore.create` was the hot
  // path bottleneck (~150ms × 7K companies = 18 min serial). Buffering
  // via createMany cuts persistence from ~7K round-trips to ~35.
  const FLUSH_EVERY = 200;
  const riskBuf: Prisma.RiskScoreCreateManyInput[] = [];
  const alertBuf: Prisma.AlertCreateManyInput[] = [];
  let written = 0;
  let alerts = 0;
  const flushRisk = async () => {
    if (riskBuf.length === 0) return;
    await prisma.riskScore.createMany({ data: riskBuf });
    riskBuf.length = 0;
  };
  const flushAlerts = async () => {
    if (alertBuf.length === 0) return;
    await prisma.alert.createMany({ data: alertBuf });
    alertBuf.length = 0;
  };

  for (const { co, v3, cases12moTotal } of computed) {
    // Benchmark — exclude the company's own score from its cohort to avoid
    // self-bias in percentile rank. Lookup by company id (not by score value)
    // so tied-score peers stay in the cohort.
    let benchmark: ReturnType<typeof computeBenchmark> | null = null;
    if (co.sectorKey) {
      const cohortAll = sectorScores.get(co.sectorKey) ?? [];
      const idx = sectorIndex.get(co.sectorKey)?.get(co.id) ?? -1;
      const cohort = idx >= 0 ? [...cohortAll.slice(0, idx), ...cohortAll.slice(idx + 1)] : cohortAll;
      benchmark = computeBenchmark(v3.score, cohort);
    }

    // Change deltas — null when no v3 snapshot exists in the lookback window.
    // No fallback to "latest prior of any version" — that conflated methodology
    // changes (v1→v3) with real risk movement.
    const latestPriorV3 = co.scores.find((s) => s.scoreVersion === "v3");
    const delta7dRef = findScoreNDaysAgo(co.scores, 7, now, "v3");
    const delta30dRef = findScoreNDaysAgo(co.scores, 30, now, "v3");
    const delta7d = delta7dRef !== null ? v3.score - delta7dRef : null;
    const delta30d = delta30dRef !== null ? v3.score - delta30dRef : null;

    // Drivers
    const sevenAgo = new Date(now.getTime() - 7 * ONE_DAY);
    const newCases7d: NewCase[] = co.links
      .map((l) => l.caseRef)
      .filter((c) => c.dateFiled && c.dateFiled >= sevenAgo && c.dateFiled <= now)
      .map((c) => ({ caseName: c.caseName, natureOfSuit: c.natureOfSuit, dateFiled: c.dateFiled! }));
    const currSnap: DriverSnapshot = {
      score: v3.score,
      recent30: v3.recent30,
      baselineMonthly: v3.baselineMonthly,
      topCategory: v3.topCategory,
      topCategoryShare: v3.topCategoryShare,
      topCircuit: v3.topCircuit,
      topCircuitShare: v3.topCircuitShare,
      jurisdictionFactor: v3.jurisdictionFactor,
      concentrationFactor: v3.concentrationFactor,
      cat12moTotal: cases12moTotal,
      meanJudgeDismissal: v3.meanJudgeDismissal,
      judgeSampleSize: v3.judgeSampleSize,
    };
    // Build prevSnap from the prior v3 row's persisted rawStats. v1 rows have
    // no rawStats so their recent30 is unknown (null) — drivers that depend on
    // it must short-circuit. Cross-version drivers (risk_jump/decay) are also
    // suppressed when there's no prior v3 snapshot.
    const prevRawStats = (latestPriorV3?.rawStats ?? null) as
      | { recent30?: number; baselineMonthly?: number }
      | null;
    const prevSnap: DriverSnapshot | null = latestPriorV3
      ? {
          score: latestPriorV3.score,
          recent30: prevRawStats?.recent30 ?? null,
          baselineMonthly: prevRawStats?.baselineMonthly ?? 0,
          topCategory: null,
          topCategoryShare: 0,
          topCircuit: null,
          topCircuitShare: 0,
          jurisdictionFactor: latestPriorV3.jurisdictionFactor ?? 1,
        }
      : null;
    const drivers = generateDrivers({ curr: currSnap, prev: prevSnap, newCases7d });

    // Persist (buffered — flushed every FLUSH_EVERY companies)
    riskBuf.push({
      companyId: co.id,
      score: v3.score,
      band: v3.band,
      volumeFactor: v3.volumeFactor,
      recencyFactor: v3.recencyFactor,
      severityFactor: v3.severityFactor,
      momentumFactor: v3.momentumFactor,
      concentrationFactor: v3.concentrationFactor,
      jurisdictionFactor: v3.jurisdictionFactor,
      judgeFactor: v3.judgeFactor,
      firmSignalFactor: v3.firmSignalFactor,
      similaritySignalFactor: v3.similaritySignalFactor,
      scoreVersion: "v3",
      caseCount: v3.caseCount,
      recentCases: v3.recentCases,
      drivers: drivers as unknown as object,
      rawStats: {
        recent30: v3.recent30,
        baselineMonthly: v3.baselineMonthly,
        topCategory: v3.topCategory,
        topCategoryShare: v3.topCategoryShare,
        topCircuit: v3.topCircuit,
        topCircuitShare: v3.topCircuitShare,
        cat12moTotal: cases12moTotal,
        meanJudgeDismissal: v3.meanJudgeDismissal,
        judgeSampleSize: v3.judgeSampleSize,
      } as unknown as object,
      delta7d,
      delta30d,
      cohortSize: benchmark?.cohortSize ?? null,
      cohortP50: benchmark?.cohortP50 ?? null,
      cohortMean: benchmark?.cohortMean ?? null,
      percentile: benchmark?.percentile ?? null,
      zScore: benchmark?.zScore ?? null,
    });
    written++;

    // --- Alerts (buffered) ---
    // risk_jump only fires when comparing same-version scores; first v3
    // snapshot per company doesn't generate a methodology-change false alarm.
    if (
      latestPriorV3 &&
      v3.score - latestPriorV3.score >= 15 &&
      !hasRecentEquivalentAlert(co.alerts, {
        type: "risk_jump",
        createdAt: now,
        refs: { from: latestPriorV3.score, to: v3.score },
      })
    ) {
      alertBuf.push({
        companyId: co.id,
        type: "risk_jump",
        severity: v3.score >= 75 ? "critical" : "warn",
        title: `Risk score jumped ${latestPriorV3.score} → ${v3.score}`,
        body: `${co.name} risk increased by ${v3.score - latestPriorV3.score} points since last snapshot.`,
        refs: { from: latestPriorV3.score, to: v3.score },
      });
      alerts++;
    }

    // new_case alerts are bulk-suppressed on cold-start ingest: when a
    // company has many cases land in one ingest, we'd emit hundreds of
    // alerts and bury anything actually new. Suppress when more than 5
    // recent cases — that's a bulk import, not real-time activity.
    const alreadyAlerted = new Set<string>();
    for (const a of co.alerts) {
      const refs = a.refs as { caseId?: string } | null;
      if (refs?.caseId) alreadyAlerted.add(refs.caseId);
    }
    const newCases7dRaw = co.links.filter((l) => {
      const c = l.caseRef;
      return c.dateFiled && c.dateFiled >= sevenAgo && !alreadyAlerted.has(c.id);
    });
    if (newCases7dRaw.length <= 5) {
      for (const l of newCases7dRaw) {
        const c = l.caseRef;
        if (!c.dateFiled) continue;
        alertBuf.push({
          companyId: co.id,
          type: "new_case",
          severity: "info",
          title: `New case filed: ${c.caseName}`,
          body: `${co.name} appears as a party in a case filed on ${c.dateFiled.toISOString().slice(0, 10)}.`,
          refs: { caseId: c.id },
        });
        alerts++;
      }
    }

    // case_spike alert (still synchronous because it requires a per-company
    // findFirst dedup against last-24h alerts; rare path, bounded cost).
    const thirtyAgo = new Date(now.getTime() - 30 * ONE_DAY);
    const oneEightyAgo = new Date(now.getTime() - 180 * ONE_DAY);
    let last30 = 0;
    let prior150 = 0;
    for (const l of co.links) {
      const f = l.caseRef.dateFiled;
      if (!f) continue;
      if (f >= thirtyAgo) last30++;
      else if (f >= oneEightyAgo) prior150++;
    }
    const monthlyBaseline = prior150 / 5;
    const spikeRefs = { last30, baseline: Number(monthlyBaseline.toFixed(2)) };
    if (
      last30 >= Math.max(3, 2 * monthlyBaseline) &&
      last30 > 0 &&
      !hasRecentEquivalentAlert(co.alerts, {
        type: "case_spike",
        createdAt: now,
        refs: spikeRefs,
      })
    ) {
      alertBuf.push({
        companyId: co.id,
        type: "case_spike",
        severity: "warn",
        title: `Spike in filings: ${last30} cases in last 30 days`,
        body: `${co.name} saw ${last30} new filings vs a baseline of ${monthlyBaseline.toFixed(1)}/month.`,
        refs: spikeRefs,
      });
      alerts++;
    }

    // Flush buffers periodically.
    if (riskBuf.length >= FLUSH_EVERY) {
      await flushRisk();
      process.stdout.write(`\rflushed ${written} risk snapshots`);
    }
    if (alertBuf.length >= FLUSH_EVERY) {
      await flushAlerts();
    }
  }

  // Final flush.
  await flushRisk();
  await flushAlerts();

  console.log(`wrote ${written} v3 risk snapshots, generated ${alerts} alerts`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
