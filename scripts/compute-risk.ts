// Recompute per-company risk scores and generate alerts.
//
// Run after ingestion (manually or via cron). Idempotent: writes a new
// RiskScore snapshot row, generates alerts only for *new* signals since the
// last run.
//
// Alert rules (v1):
//   - new_case      : a Case linked to this company, dateFiled within 7 days,
//                     not already alerted on (dedup by case id in refs).
//   - case_spike    : trailing-30-day case count >= max(3, 2 * trailing-30..180
//                     monthly average). Dedup by date so we alert at most
//                     once per company per day.
//   - risk_jump     : score increased by >= 15 vs previous snapshot.

import { prisma } from "../src/lib/db";
import { computeRisk, type CaseLite } from "../src/lib/risk";

async function main() {
  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      links: {
        select: {
          caseRef: { select: { id: true, dateFiled: true, natureOfSuit: true, caseName: true } },
        },
      },
      scores: { orderBy: { computedAt: "desc" }, take: 1 },
      alerts: { where: { type: "new_case" }, select: { refs: true }, take: 200 },
    },
  });

  const now = new Date();
  let written = 0;
  let alerts = 0;

  for (const co of companies) {
    const cases: CaseLite[] = co.links.map((l) => ({
      dateFiled: l.caseRef.dateFiled,
      natureOfSuit: l.caseRef.natureOfSuit,
    }));
    const r = computeRisk(cases, now);

    await prisma.riskScore.create({
      data: {
        companyId: co.id,
        score: r.score,
        band: r.band,
        volumeFactor: r.volumeFactor,
        recencyFactor: r.recencyFactor,
        severityFactor: r.severityFactor,
        caseCount: r.caseCount,
        recentCases: r.recentCases,
      },
    });
    written++;

    // --- Alerts ---

    // risk_jump: compare to previous snapshot.
    const prev = co.scores[0];
    if (prev && r.score - prev.score >= 15) {
      await prisma.alert.create({
        data: {
          companyId: co.id,
          type: "risk_jump",
          severity: r.score >= 75 ? "critical" : "warn",
          title: `Risk score jumped ${prev.score} → ${r.score}`,
          body: `${co.name} risk increased by ${r.score - prev.score} points since last snapshot.`,
          refs: { from: prev.score, to: r.score },
        },
      });
      alerts++;
    }

    // new_case: anything filed in last 7 days that we haven't alerted on.
    const sevenAgo = new Date(now.getTime() - 7 * 86400000);
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

    // case_spike: trailing 30 days vs 180-day baseline.
    const thirtyAgo = new Date(now.getTime() - 30 * 86400000);
    const oneEightyAgo = new Date(now.getTime() - 180 * 86400000);
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
      // Dedup: don't alert if we already have a spike alert in last 24h.
      const recentSpike = await prisma.alert.findFirst({
        where: {
          companyId: co.id,
          type: "case_spike",
          createdAt: { gte: new Date(now.getTime() - 86400000) },
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

  console.log(`wrote ${written} risk snapshots, generated ${alerts} alerts`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
