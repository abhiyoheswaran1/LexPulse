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

  return NextResponse.json({
    totals: { companies: totals[0], cases: totals[1], alerts: totals[2] },
    topRisk: ranked.slice(0, 8),
    trending,
    recentAlerts: alerts,
  });
}
