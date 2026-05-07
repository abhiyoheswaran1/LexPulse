import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const scores = await prisma.riskScore.findMany({
    where: { companyId: ctx.params.id },
    orderBy: { computedAt: "asc" },
    take: 90,
  });
  return NextResponse.json({
    history: scores.map((s) => ({
      at: s.computedAt,
      score: s.score,
      band: s.band,
      caseCount: s.caseCount,
      recentCases: s.recentCases,
      volumeFactor: s.volumeFactor,
      recencyFactor: s.recencyFactor,
      severityFactor: s.severityFactor,
    })),
  });
}
