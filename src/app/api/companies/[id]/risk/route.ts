// GET /api/companies/:id/risk
//
// Default: returns the latest snapshot in the v2 contract.
// ?history=true&limit=N: returns the last N snapshots (default 90).
// ?version=v1: returns the latest v1 snapshot if any (for replay/diff).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const SOURCES = [
  {
    name: "CourtListener / Free Law Project",
    license: "CC BY-ND 4.0",
    url: "https://www.courtlistener.com/",
  },
];

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const url = new URL(req.url);
  const history = url.searchParams.get("history") === "true";
  const version = url.searchParams.get("version");
  const limit = Math.min(365, Number(url.searchParams.get("limit") ?? 90));

  const company = await prisma.company.findUnique({
    where: { id: ctx.params.id },
    select: {
      id: true,
      name: true,
      sectorKey: true,
      sector: { select: { label: true } },
    },
  });
  if (!company) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (history) {
    const where: { companyId: string; scoreVersion?: string } = { companyId: ctx.params.id };
    if (version) where.scoreVersion = version;
    const scores = await prisma.riskScore.findMany({
      where,
      orderBy: { computedAt: "asc" },
      take: limit,
    });
    return NextResponse.json({
      history: scores.map((s) => ({
        at: s.computedAt,
        score: s.score,
        band: s.band,
        version: s.scoreVersion,
        delta_7d: s.delta7d,
        delta_30d: s.delta30d,
      })),
    });
  }

  const latest = await prisma.riskScore.findFirst({
    where: version
      ? { companyId: ctx.params.id, scoreVersion: version }
      : { companyId: ctx.params.id },
    orderBy: { computedAt: "desc" },
  });
  if (!latest) {
    return NextResponse.json({ error: "no_score" }, { status: 404 });
  }

  const benchmark =
    latest.cohortSize !== null && latest.cohortSize >= 30
      ? {
          sector: company.sectorKey,
          sector_label: company.sector?.label ?? null,
          cohort_size: latest.cohortSize,
          percentile: latest.percentile,
          sector_median: latest.cohortP50,
          z_score: latest.zScore,
        }
      : null;

  return NextResponse.json({
    score: latest.score,
    band: latest.band,
    computed_at: latest.computedAt,
    version: `${latest.scoreVersion}.0`,
    change: { delta_7d: latest.delta7d, delta_30d: latest.delta30d },
    drivers: latest.drivers ?? [],
    breakdown: {
      volume: latest.volumeFactor,
      recency: latest.recencyFactor,
      severity: latest.severityFactor,
      momentum: latest.momentumFactor ?? 0,
      concentration: latest.concentrationFactor ?? 0,
      jurisdiction: latest.jurisdictionFactor ?? 1,
    },
    benchmark,
    sources: SOURCES,
  });
}
