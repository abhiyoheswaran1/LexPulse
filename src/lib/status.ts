import { prisma } from "@/lib/db";

export type PlatformStatus = {
  ok: boolean;
  generatedAt: string;
  database: {
    ok: boolean;
    latencyMs: number;
  };
  freshness: {
    latestScoreAt: string | null;
    latestAlertAt: string | null;
    latestCaseFiledAt: string | null;
    scoreAgeHours: number | null;
    alertAgeHours: number | null;
  };
  coverage: {
    companies: number;
    cases: number;
    alerts: number;
    scoredCompanies: number;
    sectorMappedCompanies: number;
    publicCompanies: number;
    sourceLinkedCases: number;
    sectorConfidence: number | null;
  };
  operations: {
    scoreSnapshots24h: number;
    alerts24h: number;
    failedIngests24h: number;
  };
  integrations: {
    sentry: boolean;
    slack: boolean;
    email: boolean;
    billing: boolean;
  };
};

export async function getPlatformStatus(): Promise<PlatformStatus> {
  const generatedAt = new Date();
  const started = Date.now();
  let databaseOk = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    databaseOk = false;
  }

  const latencyMs = Date.now() - started;
  if (!databaseOk) {
    return {
      ok: false,
      generatedAt: generatedAt.toISOString(),
      database: { ok: false, latencyMs },
      freshness: {
        latestScoreAt: null,
        latestAlertAt: null,
        latestCaseFiledAt: null,
        scoreAgeHours: null,
        alertAgeHours: null,
      },
      coverage: {
        companies: 0,
        cases: 0,
        alerts: 0,
        scoredCompanies: 0,
        sectorMappedCompanies: 0,
        publicCompanies: 0,
        sourceLinkedCases: 0,
        sectorConfidence: null,
      },
      operations: {
        scoreSnapshots24h: 0,
        alerts24h: 0,
        failedIngests24h: 0,
      },
      integrations: integrationStatus(),
    };
  }

  const since24h = new Date(generatedAt.getTime() - 24 * 60 * 60 * 1000);
  const [summary] = await prisma.$queryRaw<
    Array<{
      companies: bigint;
      cases: bigint;
      alerts: bigint;
      scoredCompanies: bigint;
      sectorMappedCompanies: bigint;
      publicCompanies: bigint;
      sourceLinkedCases: bigint;
      sectorConfidence: number | null;
      scoreSnapshots24h: bigint;
      alerts24h: bigint;
      failedIngests24h: bigint;
      latestScoreAt: Date | null;
      latestAlertAt: Date | null;
      latestCaseFiledAt: Date | null;
    }>
  >`
    SELECT
      (SELECT COUNT(*) FROM companies WHERE "displayStatus" = 'visible') AS "companies",
      (SELECT COUNT(*) FROM cases) AS "cases",
      (SELECT COUNT(*) FROM alerts) AS "alerts",
      (SELECT COUNT(DISTINCT rs."companyId") FROM risk_scores rs JOIN companies c ON c.id = rs."companyId" WHERE c."displayStatus" = 'visible') AS "scoredCompanies",
      (SELECT COUNT(*) FROM companies WHERE "sectorKey" IS NOT NULL AND "displayStatus" = 'visible') AS "sectorMappedCompanies",
      (SELECT COUNT(*) FROM companies WHERE cik IS NOT NULL AND "displayStatus" = 'visible') AS "publicCompanies",
      (SELECT COUNT(*) FROM cases WHERE "sourceId" IS NOT NULL) AS "sourceLinkedCases",
      (SELECT AVG("sectorConfidence") FROM companies WHERE "sectorConfidence" IS NOT NULL AND "displayStatus" = 'visible') AS "sectorConfidence",
      (SELECT COUNT(*) FROM risk_scores WHERE "computedAt" >= ${since24h}) AS "scoreSnapshots24h",
      (SELECT COUNT(*) FROM alerts WHERE "createdAt" >= ${since24h}) AS "alerts24h",
      (
        (SELECT COUNT(*) FROM audit_logs WHERE "createdAt" >= ${since24h} AND action LIKE '%failed%') +
        (SELECT COUNT(*) FROM data_ingest_runs WHERE "startedAt" >= ${since24h} AND status = 'failed')
      ) AS "failedIngests24h",
      (SELECT MAX("computedAt") FROM risk_scores) AS "latestScoreAt",
      (SELECT MAX("createdAt") FROM alerts) AS "latestAlertAt",
      (SELECT MAX("dateFiled") FROM cases) AS "latestCaseFiledAt"
  `;

  const latestScoreAt = summary.latestScoreAt;
  const latestAlertAt = summary.latestAlertAt;

  return {
    ok: databaseOk && Boolean(latestScoreAt),
    generatedAt: generatedAt.toISOString(),
    database: { ok: databaseOk, latencyMs },
    freshness: {
      latestScoreAt: latestScoreAt?.toISOString() ?? null,
      latestAlertAt: latestAlertAt?.toISOString() ?? null,
      latestCaseFiledAt: summary.latestCaseFiledAt?.toISOString() ?? null,
      scoreAgeHours: latestScoreAt ? hoursSince(latestScoreAt, generatedAt) : null,
      alertAgeHours: latestAlertAt ? hoursSince(latestAlertAt, generatedAt) : null,
    },
    coverage: {
      companies: Number(summary.companies),
      cases: Number(summary.cases),
      alerts: Number(summary.alerts),
      scoredCompanies: Number(summary.scoredCompanies),
      sectorMappedCompanies: Number(summary.sectorMappedCompanies),
      publicCompanies: Number(summary.publicCompanies),
      sourceLinkedCases: Number(summary.sourceLinkedCases),
      sectorConfidence: summary.sectorConfidence,
    },
    operations: {
      scoreSnapshots24h: Number(summary.scoreSnapshots24h),
      alerts24h: Number(summary.alerts24h),
      failedIngests24h: Number(summary.failedIngests24h),
    },
    integrations: integrationStatus(),
  };
}

function hoursSince(date: Date, now: Date) {
  return Math.max(0, Math.round(((now.getTime() - date.getTime()) / 36_000) / 10));
}

function integrationStatus() {
  return {
    sentry: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
    slack: Boolean(process.env.SLACK_WEBHOOK_URL),
    email: Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST),
    billing: Boolean(process.env.STRIPE_SECRET_KEY),
  };
}
