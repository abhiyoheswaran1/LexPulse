import { summarizeDashboardEntityCounts, type DashboardEntityCountsInput } from "@/lib/company-promotion";
import { prisma } from "@/lib/db";

export type DashboardCounts = DashboardEntityCountsInput & {
  trackedEntities: number;
  cases: number;
  activeAlerts: number;
  latestScoreAt: Date | null;
  latestCaseFiledAt: Date | null;
};

export async function getDashboardCounts(): Promise<DashboardCounts> {
  const [summary] = await prisma.$queryRaw<
    Array<{
      trackedEntities: bigint;
      secListedUniverse: bigint;
      sp1500Universe: bigint;
      russell3000Universe: bigint;
      litigationLinkedCompanies: bigint;
      riskScoredCompanies: bigint;
      unresolvedObservedParties: bigint;
      cases: bigint;
      activeAlerts: bigint;
      latestScoreAt: Date | null;
      latestCaseFiledAt: Date | null;
    }>
  >`
    SELECT
      (SELECT COUNT(*) FROM companies WHERE "displayStatus" = 'visible') AS "trackedEntities",
      (SELECT COUNT(*) FROM company_master WHERE universe @> ARRAY['sec_listed']::TEXT[]) AS "secListedUniverse",
      (SELECT COUNT(*) FROM company_master WHERE universe @> ARRAY['sp1500_import']::TEXT[]) AS "sp1500Universe",
      (SELECT COUNT(*) FROM company_master WHERE universe @> ARRAY['russell3000_import']::TEXT[]) AS "russell3000Universe",
      (SELECT COUNT(DISTINCT l."companyId") FROM company_case_link l JOIN companies c ON c.id = l."companyId" WHERE c."displayStatus" = 'visible') AS "litigationLinkedCompanies",
      (SELECT COUNT(DISTINCT rs."companyId") FROM risk_scores rs JOIN companies c ON c.id = rs."companyId" WHERE rs."scoreVersion" = 'v3' AND c."displayStatus" = 'visible') AS "riskScoredCompanies",
      (SELECT COUNT(*) FROM observed_parties op WHERE NOT EXISTS (
        SELECT 1 FROM entity_matches em WHERE em."observedPartyId" = op.id
      )) AS "unresolvedObservedParties",
      (SELECT COUNT(*) FROM cases) AS cases,
      (SELECT COUNT(*) FROM alerts a JOIN companies c ON c.id = a."companyId" WHERE c."displayStatus" = 'visible') AS "activeAlerts",
      (SELECT MAX("computedAt") FROM risk_scores WHERE "scoreVersion" = 'v3') AS "latestScoreAt",
      (SELECT MAX("dateFiled") FROM cases) AS "latestCaseFiledAt"
  `;

  return {
    trackedEntities: Number(summary.trackedEntities),
    ...summarizeDashboardEntityCounts({
      secListedUniverse: Number(summary.secListedUniverse),
      sp1500Universe: Number(summary.sp1500Universe),
      russell3000Universe: Number(summary.russell3000Universe),
      litigationLinkedCompanies: Number(summary.litigationLinkedCompanies),
      riskScoredCompanies: Number(summary.riskScoredCompanies),
      unresolvedObservedParties: Number(summary.unresolvedObservedParties),
    }),
    cases: Number(summary.cases),
    activeAlerts: Number(summary.activeAlerts),
    latestScoreAt: summary.latestScoreAt,
    latestCaseFiledAt: summary.latestCaseFiledAt,
  };
}
