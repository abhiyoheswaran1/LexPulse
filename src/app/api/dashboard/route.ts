import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDashboardCounts } from "@/lib/dashboard-counts";

export const dynamic = "force-dynamic";

type DashboardCompanyRow = {
  id: string;
  name: string;
  ticker: string | null;
  caseCount: bigint;
  score: number;
  band: string;
  recentCases: number;
  delta7d: number | null;
};

// Aggregated dashboard payload — single round-trip for the home page.
export async function GET() {
  const [topRiskRows, trendingRows, moverRows, alerts, totals] = await Promise.all([
    topRisk(),
    recentPressure(),
    latestMovers(),
    prisma.alert.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: { company: { select: { id: true, name: true } } },
    }),
    getDashboardCounts(),
  ]);

  return NextResponse.json(
    {
      totals,
      topRisk: topRiskRows.map(toCompanySummary),
      trending: trendingRows.map(toCompanySummary),
      recentAlerts: alerts,
      movers: moverRows.map((row) => ({
        id: row.id,
        name: row.name,
        ticker: row.ticker,
        score: row.score,
        band: row.band,
        delta7d: row.delta7d ?? 0,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function topRisk() {
  return prisma.$queryRaw<DashboardCompanyRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON ("companyId")
        "companyId", score, band, "caseCount", "recentCases", "delta7d", "computedAt"
      FROM risk_scores
      WHERE "scoreVersion" = 'v3'
      ORDER BY "companyId", "computedAt" DESC
    )
    SELECT
      c.id,
      c.name,
      c.ticker,
      latest."caseCount"::BIGINT AS "caseCount",
      latest.score,
      latest.band,
      latest."recentCases",
      latest."delta7d"
    FROM latest
    JOIN companies c ON c.id = latest."companyId"
    ORDER BY latest.score DESC, latest."recentCases" DESC
    LIMIT 8
  `;
}

function recentPressure() {
  return prisma.$queryRaw<DashboardCompanyRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON ("companyId")
        "companyId", score, band, "caseCount", "recentCases", "delta7d", "computedAt"
      FROM risk_scores
      WHERE "scoreVersion" = 'v3'
      ORDER BY "companyId", "computedAt" DESC
    )
    SELECT
      c.id,
      c.name,
      c.ticker,
      latest."caseCount"::BIGINT AS "caseCount",
      latest.score,
      latest.band,
      latest."recentCases",
      latest."delta7d"
    FROM latest
    JOIN companies c ON c.id = latest."companyId"
    ORDER BY latest."recentCases" DESC, latest.score DESC
    LIMIT 8
  `;
}

function latestMovers() {
  return prisma.$queryRaw<DashboardCompanyRow[]>`
    WITH latest AS (
      SELECT DISTINCT ON ("companyId")
        "companyId", score, band, "caseCount", "recentCases", "delta7d", "computedAt"
      FROM risk_scores
      WHERE "scoreVersion" = 'v3'
      ORDER BY "companyId", "computedAt" DESC
    )
    SELECT
      c.id,
      c.name,
      c.ticker,
      latest."caseCount"::BIGINT AS "caseCount",
      latest.score,
      latest.band,
      latest."recentCases",
      latest."delta7d"
    FROM latest
    JOIN companies c ON c.id = latest."companyId"
    WHERE latest."delta7d" IS NOT NULL
      AND latest."delta7d" != 0
    ORDER BY ABS(latest."delta7d") DESC
    LIMIT 10
  `;
}

function toCompanySummary(row: DashboardCompanyRow) {
  return {
    id: row.id,
    name: row.name,
    caseCount: Number(row.caseCount),
    score: row.score,
    band: row.band,
    recentCases: row.recentCases,
  };
}
