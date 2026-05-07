// GET /api/companies/:id/risk
//
// Default: returns the latest snapshot in the latest score-version contract
// available for this company (v3 if any, else v2, else v1).
// ?history=true&limit=N: returns the last N snapshots (default 90).
// ?version=v1|v2|v3: returns the latest snapshot of that version (replay/diff).
//
// Response shape varies by version: v3 includes breakdown.judge; v2 does not.
// Clients that pin a version see only the breakdown fields that existed in
// that methodology revision.

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

  // breakdown is version-shaped: v1 returns 3 fields, v2 returns 6, v3 returns 7.
  // This preserves contract stability for clients that pinned ?version=vN.
  type Breakdown = {
    volume: number;
    recency: number;
    severity: number;
    momentum?: number;
    concentration?: number;
    jurisdiction?: number;
    judge?: number;
  };
  const breakdown: Breakdown = {
    volume: latest.volumeFactor,
    recency: latest.recencyFactor,
    severity: latest.severityFactor,
  };
  if (latest.scoreVersion === "v2" || latest.scoreVersion === "v3") {
    breakdown.momentum = latest.momentumFactor ?? 0;
    breakdown.concentration = latest.concentrationFactor ?? 0;
    breakdown.jurisdiction = latest.jurisdictionFactor ?? 1;
  }
  if (latest.scoreVersion === "v3") {
    breakdown.judge = latest.judgeFactor ?? 1;
  }

  return NextResponse.json({
    score: latest.score,
    band: latest.band,
    computed_at: latest.computedAt,
    version: `${latest.scoreVersion}.0`,
    change: { delta_7d: latest.delta7d, delta_30d: latest.delta30d },
    drivers: latest.drivers ?? [],
    breakdown,
    benchmark,
    sources: SOURCES,
  });
}
