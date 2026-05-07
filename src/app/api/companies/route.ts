import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/companies?limit=50&sort=risk
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 50));
  const sort = url.searchParams.get("sort") ?? "risk";

  const companies = await prisma.company.findMany({
    take: limit,
    include: {
      scores: { orderBy: { computedAt: "desc" }, take: 1 },
      _count: { select: { links: true } },
    },
  });

  const rows = companies.map((c) => ({
    id: c.id,
    name: c.name,
    ticker: c.ticker,
    caseCount: c._count.links,
    score: c.scores[0]?.score ?? 0,
    band: c.scores[0]?.band ?? "low",
    recentCases: c.scores[0]?.recentCases ?? 0,
  }));

  if (sort === "risk") rows.sort((a, b) => b.score - a.score);
  else if (sort === "cases") rows.sort((a, b) => b.caseCount - a.caseCount);
  else rows.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ companies: rows });
}
