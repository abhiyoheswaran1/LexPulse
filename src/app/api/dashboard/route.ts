import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Aggregated dashboard payload — single round-trip for the home page.
export async function GET() {
  const [companies, alerts, totals] = await Promise.all([
    prisma.company.findMany({
      include: {
        scores: { orderBy: { computedAt: "desc" }, take: 1 },
        _count: { select: { links: true } },
      },
    }),
    prisma.alert.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { company: { select: { id: true, name: true } } },
    }),
    Promise.all([
      prisma.company.count(),
      prisma.case.count(),
      prisma.alert.count(),
    ]),
  ]);

  const ranked = companies
    .map((c) => ({
      id: c.id,
      name: c.name,
      caseCount: c._count.links,
      score: c.scores[0]?.score ?? 0,
      band: c.scores[0]?.band ?? "low",
      recentCases: c.scores[0]?.recentCases ?? 0,
    }))
    .sort((a, b) => b.score - a.score);

  const trending = [...ranked].sort((a, b) => b.recentCases - a.recentCases).slice(0, 8);

  // 7d movers: latest v2 snapshot per company with non-zero delta7d.
  const moverSnapshots = await prisma.riskScore.findMany({
    where: {
      delta7d: { not: null },
      NOT: { delta7d: 0 },
      scoreVersion: "v2",
    },
    orderBy: { computedAt: "desc" },
    take: 1000,
    include: { company: { select: { id: true, name: true, ticker: true } } },
  });
  const seenMover = new Set<string>();
  const movers = moverSnapshots
    .filter((s) => {
      if (seenMover.has(s.companyId)) return false;
      seenMover.add(s.companyId);
      return true;
    })
    .map((s) => ({
      id: s.company.id,
      name: s.company.name,
      ticker: s.company.ticker,
      score: s.score,
      band: s.band,
      delta7d: s.delta7d!,
    }))
    .sort((a, b) => Math.abs(b.delta7d) - Math.abs(a.delta7d))
    .slice(0, 10);

  return NextResponse.json({
    totals: { companies: totals[0], cases: totals[1], alerts: totals[2] },
    topRisk: ranked.slice(0, 8),
    trending,
    recentAlerts: alerts,
    movers,
  });
}
