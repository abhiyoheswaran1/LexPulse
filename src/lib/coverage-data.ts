import { prisma } from "@/lib/db";
import { summarizeCoverage, type CoverageInput, type CoverageSummary } from "@/lib/coverage";

export type CoverageReport = CoverageSummary & {
  generatedAt: string;
  sourceHealth: Array<{
    source: string;
    jobType: string;
    status: string;
    health: "healthy" | "running" | "stale" | "failed";
    startedAt: string;
    finishedAt: string | null;
    lastSuccessfulAt: string | null;
    rowsFailed: number;
    error: string | null;
  }>;
  sources: Array<{
    source: string;
    jobType: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    rowsFetched: number;
    rowsInserted: number;
    rowsUpdated: number;
    rowsFailed: number;
    error: string | null;
  }>;
};

export async function getCoverageReport(): Promise<CoverageReport> {
  const generatedAt = new Date();
  const since24h = new Date(generatedAt.getTime() - 24 * 60 * 60 * 1000);
  const staleCutoff = new Date(generatedAt.getTime() - 48 * 60 * 60 * 1000);

  const [summary] = await prisma.$queryRaw<
    Array<{
      companyMasters: bigint;
      secListed: bigint;
      sp1500: bigint;
      russell3000: bigint;
      observedParties: bigint;
      matchedParties: bigint;
      unresolvedParties: bigint;
      highConfidenceMatches: bigint;
      mediumConfidenceMatches: bigint;
      lowConfidenceMatches: bigint;
      caseOutcomes: bigint;
      externalEvents: bigint;
      staleSources: bigint;
      failedRuns24h: bigint;
    }>
  >`
    WITH latest_runs AS (
      SELECT DISTINCT ON (source, "jobType")
        source,
        "jobType",
        status,
        "finishedAt",
        "startedAt"
      FROM data_ingest_runs
      ORDER BY source, "jobType", "startedAt" DESC
    )
    SELECT
      (SELECT COUNT(*) FROM company_master) AS "companyMasters",
      (SELECT COUNT(*) FROM company_master WHERE universe @> ARRAY['sec_listed']::TEXT[]) AS "secListed",
      (SELECT COUNT(*) FROM company_master WHERE universe @> ARRAY['sp1500_import']::TEXT[]) AS "sp1500",
      (SELECT COUNT(*) FROM company_master WHERE universe @> ARRAY['russell3000_import']::TEXT[]) AS "russell3000",
      (SELECT COUNT(*) FROM observed_parties) AS "observedParties",
      (SELECT COUNT(DISTINCT "observedPartyId") FROM entity_matches WHERE "reviewStatus" IN ('auto_accepted', 'pending', 'ambiguous')) AS "matchedParties",
      (SELECT COUNT(*) FROM observed_parties op WHERE NOT EXISTS (SELECT 1 FROM entity_matches em WHERE em."observedPartyId" = op.id)) AS "unresolvedParties",
      (SELECT COUNT(*) FROM entity_matches WHERE confidence = 'high') AS "highConfidenceMatches",
      (SELECT COUNT(*) FROM entity_matches WHERE confidence = 'medium') AS "mediumConfidenceMatches",
      (SELECT COUNT(*) FROM entity_matches WHERE confidence = 'low') AS "lowConfidenceMatches",
      (SELECT COUNT(*) FROM case_outcomes) AS "caseOutcomes",
      (SELECT COUNT(*) FROM external_events) AS "externalEvents",
      (SELECT COUNT(*) FROM latest_runs WHERE status != 'success' OR COALESCE("finishedAt", "startedAt") < ${staleCutoff}) AS "staleSources",
      (SELECT COUNT(*) FROM data_ingest_runs WHERE "startedAt" >= ${since24h} AND status = 'failed') AS "failedRuns24h"
  `;

  const runs = await prisma.dataIngestRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 12,
    select: {
      source: true,
      jobType: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      rowsFetched: true,
      rowsInserted: true,
      rowsUpdated: true,
      rowsFailed: true,
      error: true,
    },
  });
  const latestRuns = await prisma.$queryRaw<
    Array<{
      source: string;
      jobType: string;
      status: string;
      startedAt: Date;
      finishedAt: Date | null;
      lastSuccessfulAt: Date | null;
      rowsFailed: number;
      error: string | null;
    }>
  >`
    WITH latest_runs AS (
      SELECT DISTINCT ON (source, "jobType")
        source,
        "jobType",
        status,
        "startedAt",
        "finishedAt",
        "rowsFailed",
        error
      FROM data_ingest_runs
      ORDER BY source, "jobType", "startedAt" DESC
    ),
    successful_runs AS (
      SELECT
        source,
        "jobType",
        MAX("finishedAt") AS "lastSuccessfulAt"
      FROM data_ingest_runs
      WHERE status = 'success'
      GROUP BY source, "jobType"
    )
    SELECT
      latest_runs.source,
      latest_runs."jobType",
      latest_runs.status,
      latest_runs."startedAt",
      latest_runs."finishedAt",
      successful_runs."lastSuccessfulAt",
      latest_runs."rowsFailed",
      latest_runs.error
    FROM latest_runs
    LEFT JOIN successful_runs
      ON successful_runs.source = latest_runs.source
     AND successful_runs."jobType" = latest_runs."jobType"
    ORDER BY latest_runs.source ASC, latest_runs."jobType" ASC
  `;

  const input: CoverageInput = {
    companyMasters: Number(summary.companyMasters),
    secListed: Number(summary.secListed),
    sp1500: Number(summary.sp1500),
    russell3000: Number(summary.russell3000),
    observedParties: Number(summary.observedParties),
    matchedParties: Number(summary.matchedParties),
    unresolvedParties: Number(summary.unresolvedParties),
    highConfidenceMatches: Number(summary.highConfidenceMatches),
    mediumConfidenceMatches: Number(summary.mediumConfidenceMatches),
    lowConfidenceMatches: Number(summary.lowConfidenceMatches),
    caseOutcomes: Number(summary.caseOutcomes),
    externalEvents: Number(summary.externalEvents),
    staleSources: Number(summary.staleSources),
    failedRuns24h: Number(summary.failedRuns24h),
  };

  return {
    ...summarizeCoverage(input),
    generatedAt: generatedAt.toISOString(),
    sourceHealth: latestRuns.map((run) => {
      const freshnessAt = run.finishedAt ?? run.startedAt;
      const isStale = freshnessAt < staleCutoff;
      const health =
        run.status === "running"
          ? "running"
          : run.status !== "success"
            ? "failed"
            : isStale
              ? "stale"
              : "healthy";
      return {
        source: run.source,
        jobType: run.jobType,
        status: run.status,
        health,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        lastSuccessfulAt: run.lastSuccessfulAt?.toISOString() ?? null,
        rowsFailed: run.rowsFailed,
        error: run.error,
      };
    }),
    sources: runs.map((run) => ({
      source: run.source,
      jobType: run.jobType,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      rowsFetched: run.rowsFetched,
      rowsInserted: run.rowsInserted,
      rowsUpdated: run.rowsUpdated,
      rowsFailed: run.rowsFailed,
      error: run.error,
    })),
  };
}
