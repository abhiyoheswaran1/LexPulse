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
        take: 35, // covers latest + 7d-ago + 30d-ago lookups for daily-cadence runs
      },
      alerts: { where: { type: "new_case" }, select: { refs: true }, take: 200 },
    },
  });
}

function pass1(co: CompanyRow, now: Date): { v2: RiskBreakdownV2; cases: CaseLiteV2[] } {
  const cases: CaseLiteV2[] = co.links.map((l) => ({
    dateFiled: l.caseRef.dateFiled,
    natureOfSuit: l.caseRef.natureOfSuit,
    court: l.caseRef.court,
  }));
  const v2 = computeRiskV2(cases, null, now);
  return { v2, cases };
}

function findScoreNDaysAgo(scores: CompanyRow["scores"], n: number, now: Date): number | null {
  const cutoff = new Date(now.getTime() - n * ONE_DAY);
  // First snapshot at or before cutoff (scores are ordered desc by computedAt).
  for (const s of scores) {
    if (s.computedAt <= cutoff) return s.score;
  }
  return null;
}

async function main() {
  const companies = await loadCompanies();
  const now = new Date();

  // --- Pass 1 ---
  const computed: Array<{ co: CompanyRow; v2: RiskBreakdownV2; cases: CaseLiteV2[] }> = [];
  const sectorScores: Map<string, number[]> = new Map();
  for (const co of companies) {
    const { v2, cases } = pass1(co, now);
    computed.push({ co, v2, cases });
    if (co.sectorKey) {
      const arr = sectorScores.get(co.sectorKey) ?? [];
      arr.push(v2.score);
      sectorScores.set(co.sectorKey, arr);
    }
  }

  // --- Pass 2 ---
  let written = 0;
  let alerts = 0;
  for (const { co, v2 } of computed) {
    // Benchmark
    let benchmark: ReturnType<typeof computeBenchmark> | null = null;
    if (co.sectorKey) {
      const cohort = sectorScores.get(co.sectorKey) ?? [];
      benchmark = computeBenchmark(v2.score, cohort);
    }

    // Change deltas — null when no prior snapshot exists at all
    const latestPrior = co.scores[0];
    const delta7d = latestPrior
      ? v2.score - (findScoreNDaysAgo(co.scores, 7, now) ?? latestPrior.score)
      : null;
    const delta30d = latestPrior
      ? v2.score - (findScoreNDaysAgo(co.scores, 30, now) ?? latestPrior.score)
      : null;

    // Drivers
    const sevenAgo = new Date(now.getTime() - 7 * ONE_DAY);
    const newCases7d: NewCase[] = co.links
      .map((l) => l.caseRef)
      .filter((c) => c.dateFiled && c.dateFiled >= sevenAgo)
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
    };
    const prevSnap: DriverSnapshot | null = latestPrior
      ? {
          score: latestPrior.score,
          recent30: 0,
          baselineMonthly: 0,
          topCategory: null,
          topCategoryShare: 0,
          topCircuit: null,
          topCircuitShare: 0,
          jurisdictionFactor: latestPrior.jurisdictionFactor ?? 1,
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
        drivers: drivers.map((d) => ({ ...d })) as unknown as object,
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
    if (latestPrior && v2.score - latestPrior.score >= 15) {
      await prisma.alert.create({
        data: {
          companyId: co.id,
          type: "risk_jump",
          severity: v2.score >= 75 ? "critical" : "warn",
          title: `Risk score jumped ${latestPrior.score} → ${v2.score}`,
          body: `${co.name} risk increased by ${v2.score - latestPrior.score} points since last snapshot.`,
          refs: { from: latestPrior.score, to: v2.score },
        },
      });
      alerts++;
    }

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
