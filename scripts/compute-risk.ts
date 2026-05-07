// Recompute per-company risk scores and generate alerts (v2).
//
// Two-pass:
//   Pass 1 — compute v2 breakdown + drivers per company; accumulate
//            { sectorKey: scores[] } in memory.
//   Pass 2 — compute benchmarks per company against accumulated cohort;
//            persist enriched RiskScore snapshot; emit alerts.
//
// Idempotent on alerts: dedup by case id (new_case) and 24h (case_spike).

import { prisma } from "../src/lib/db";
import { computeRiskV2, type CaseLiteV2, type RiskBreakdownV2 } from "../src/lib/risk";
import { generateDrivers, type DriverSnapshot, type NewCase } from "../src/lib/drivers";
import { computeBenchmark } from "../src/lib/benchmarks";

const ONE_DAY = 86400000;

type CompanyRow = Awaited<ReturnType<typeof loadCompanies>>[number];

async function loadCompanies() {
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
            },
          },
        },
      },
      scores: {
        orderBy: { computedAt: "desc" },
        take: 100, // headroom for delta lookups even with multiple-runs-per-day
      },
      alerts: { where: { type: "new_case" }, select: { refs: true }, take: 200 },
    },
  });
}

function pass1(
  co: CompanyRow,
  now: Date,
): { v2: RiskBreakdownV2; cases: CaseLiteV2[]; cases12moTotal: number } {
  const cases: CaseLiteV2[] = co.links.map((l) => ({
    dateFiled: l.caseRef.dateFiled,
    natureOfSuit: l.caseRef.natureOfSuit,
    court: l.caseRef.court,
  }));
  const v2 = computeRiskV2(cases, null, now);
  // Count 12mo cases inline so drivers.category_concentration can apply its
  // ≥3 minimum-count gate without re-traversing.
  let cases12moTotal = 0;
  for (const c of cases) {
    if (!c.dateFiled) continue;
    const age = now.getTime() - c.dateFiled.getTime();
    if (age < 0 || age > 365 * 86400000) continue;
    cases12moTotal++;
  }
  return { v2, cases, cases12moTotal };
}

// Returns the score from the most recent snapshot at-or-before (now - n days),
// filtered to a specific scoreVersion so v1↔v2 cross-version comparisons don't
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
  const companies = await loadCompanies();
  const now = new Date();

  // --- Pass 1 ---
  const computed: Array<{
    co: CompanyRow;
    v2: RiskBreakdownV2;
    cases: CaseLiteV2[];
    cases12moTotal: number;
  }> = [];
  const sectorScores: Map<string, number[]> = new Map();
  for (const co of companies) {
    const { v2, cases, cases12moTotal } = pass1(co, now);
    computed.push({ co, v2, cases, cases12moTotal });
    if (co.sectorKey) {
      const arr = sectorScores.get(co.sectorKey) ?? [];
      arr.push(v2.score);
      sectorScores.set(co.sectorKey, arr);
    }
  }

  // --- Pass 2 ---
  let written = 0;
  let alerts = 0;
  for (const { co, v2, cases12moTotal } of computed) {
    // Benchmark — exclude the company's own score from its cohort to avoid
    // self-bias in percentile rank. (Subtle for cohort >= 30 but defensible.)
    let benchmark: ReturnType<typeof computeBenchmark> | null = null;
    if (co.sectorKey) {
      const cohortAll = sectorScores.get(co.sectorKey) ?? [];
      const idx = cohortAll.indexOf(v2.score);
      const cohort = idx >= 0 ? [...cohortAll.slice(0, idx), ...cohortAll.slice(idx + 1)] : cohortAll;
      benchmark = computeBenchmark(v2.score, cohort);
    }

    // Change deltas — null when no v2 snapshot exists in the lookback window.
    // No fallback to "latest prior of any version" — that conflated methodology
    // changes (v1→v2) with real risk movement.
    const latestPriorV2 = co.scores.find((s) => s.scoreVersion === "v2");
    const latestPriorAny = co.scores[0];
    const delta7dRef = findScoreNDaysAgo(co.scores, 7, now, "v2");
    const delta30dRef = findScoreNDaysAgo(co.scores, 30, now, "v2");
    const delta7d = delta7dRef !== null ? v2.score - delta7dRef : null;
    const delta30d = delta30dRef !== null ? v2.score - delta30dRef : null;

    // Drivers
    const sevenAgo = new Date(now.getTime() - 7 * ONE_DAY);
    const newCases7d: NewCase[] = co.links
      .map((l) => l.caseRef)
      .filter((c) => c.dateFiled && c.dateFiled >= sevenAgo && c.dateFiled <= now)
      .map((c) => ({ caseName: c.caseName, natureOfSuit: c.natureOfSuit, dateFiled: c.dateFiled! }));
    const currSnap: DriverSnapshot = {
      score: v2.score,
      recent30: v2.recent30,
      baselineMonthly: v2.baselineMonthly,
      topCategory: v2.topCategory,
      topCategoryShare: v2.topCategoryShare,
      topCircuit: v2.topCircuit,
      topCircuitShare: v2.topCircuitShare,
      jurisdictionFactor: v2.jurisdictionFactor,
      cat12moTotal: cases12moTotal,
    };
    // Build prevSnap from the prior v2 row's persisted rawStats. v1 rows have
    // no rawStats so their recent30 is unknown (null) — drivers that depend on
    // it must short-circuit. Cross-version drivers (risk_jump/decay) are also
    // suppressed when there's no prior v2 snapshot.
    const prevRawStats = (latestPriorV2?.rawStats ?? null) as
      | { recent30?: number; baselineMonthly?: number }
      | null;
    const prevSnap: DriverSnapshot | null = latestPriorV2
      ? {
          score: latestPriorV2.score,
          recent30: prevRawStats?.recent30 ?? null,
          baselineMonthly: prevRawStats?.baselineMonthly ?? 0,
          topCategory: null,
          topCategoryShare: 0,
          topCircuit: null,
          topCircuitShare: 0,
          jurisdictionFactor: latestPriorV2.jurisdictionFactor ?? 1,
        }
      : null;
    const drivers = generateDrivers({ curr: currSnap, prev: prevSnap, newCases7d });

    // Persist
    await prisma.riskScore.create({
      data: {
        companyId: co.id,
        score: v2.score,
        band: v2.band,
        volumeFactor: v2.volumeFactor,
        recencyFactor: v2.recencyFactor,
        severityFactor: v2.severityFactor,
        momentumFactor: v2.momentumFactor,
        concentrationFactor: v2.concentrationFactor,
        jurisdictionFactor: v2.jurisdictionFactor,
        scoreVersion: "v2",
        caseCount: v2.caseCount,
        recentCases: v2.recentCases,
        drivers: drivers as unknown as object,
        rawStats: {
          recent30: v2.recent30,
          baselineMonthly: v2.baselineMonthly,
          topCategory: v2.topCategory,
          topCategoryShare: v2.topCategoryShare,
          topCircuit: v2.topCircuit,
          topCircuitShare: v2.topCircuitShare,
          cat12moTotal: cases12moTotal,
        } as unknown as object,
        delta7d,
        delta30d,
        cohortSize: benchmark?.cohortSize ?? null,
        cohortP50: benchmark?.cohortP50 ?? null,
        cohortMean: benchmark?.cohortMean ?? null,
        percentile: benchmark?.percentile ?? null,
        zScore: benchmark?.zScore ?? null,
      },
    });
    written++;

    // --- Alerts (preserved from v1, plus risk_jump on v2 deltas) ---
    // risk_jump only fires when comparing same-version scores; first v2
    // snapshot per company therefore doesn't generate a methodology-change
    // false alarm.
    if (latestPriorV2 && v2.score - latestPriorV2.score >= 15) {
      await prisma.alert.create({
        data: {
          companyId: co.id,
          type: "risk_jump",
          severity: v2.score >= 75 ? "critical" : "warn",
          title: `Risk score jumped ${latestPriorV2.score} → ${v2.score}`,
          body: `${co.name} risk increased by ${v2.score - latestPriorV2.score} points since last snapshot.`,
          refs: { from: latestPriorV2.score, to: v2.score },
        },
      });
      alerts++;
    }
    // Reference the legacy variable so the no-unused-vars lint stays quiet
    // (we keep it around for future "any-version" comparisons if needed).
    void latestPriorAny;

    const alreadyAlerted = new Set<string>();
    for (const a of co.alerts) {
      const refs = a.refs as { caseId?: string } | null;
      if (refs?.caseId) alreadyAlerted.add(refs.caseId);
    }
    for (const l of co.links) {
      const c = l.caseRef;
      if (!c.dateFiled || c.dateFiled < sevenAgo) continue;
      if (alreadyAlerted.has(c.id)) continue;
      await prisma.alert.create({
        data: {
          companyId: co.id,
          type: "new_case",
          severity: "info",
          title: `New case filed: ${c.caseName}`,
          body: `${co.name} appears as a party in a case filed on ${c.dateFiled.toISOString().slice(0, 10)}.`,
          refs: { caseId: c.id },
        },
      });
      alerts++;
    }

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
    if (last30 >= Math.max(3, 2 * monthlyBaseline) && last30 > 0) {
      const recentSpike = await prisma.alert.findFirst({
        where: {
          companyId: co.id,
          type: "case_spike",
          createdAt: { gte: new Date(now.getTime() - ONE_DAY) },
        },
      });
      if (!recentSpike) {
        await prisma.alert.create({
          data: {
            companyId: co.id,
            type: "case_spike",
            severity: "warn",
            title: `Spike in filings: ${last30} cases in last 30 days`,
            body: `${co.name} saw ${last30} new filings vs a baseline of ${monthlyBaseline.toFixed(1)}/month.`,
            refs: { last30, baseline: Number(monthlyBaseline.toFixed(2)) },
          },
        });
        alerts++;
      }
    }
  }

  console.log(`wrote ${written} v2 risk snapshots, generated ${alerts} alerts`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
