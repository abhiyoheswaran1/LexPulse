import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const company = await prisma.company.findUnique({
    where: { id: ctx.params.id },
    include: {
      scores: { orderBy: { computedAt: "desc" }, take: 30 },
      _count: { select: { links: true } },
    },
  });
  if (!company) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({
    id: company.id,
    name: company.name,
    ticker: company.ticker,
    jurisdiction: company.jurisdiction,
    caseCount: company._count.links,
    latestScore: company.scores[0] ?? null,
    scoreHistory: company.scores
      .slice()
      .reverse()
      .map((s) => ({ at: s.computedAt, score: s.score, band: s.band })),
  });
}
