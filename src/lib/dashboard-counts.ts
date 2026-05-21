import { summarizeDashboardEntityCounts, type DashboardEntityCountsInput } from "@/lib/company-promotion";
import { prisma } from "@/lib/db";

export type DashboardCounts = DashboardEntityCountsInput & {
  trackedEntities: number;
  cases: number;
  activeAlerts: number;
};

export async function getDashboardCounts(): Promise<DashboardCounts> {
  const [summary] = await prisma.$queryRaw<
    Array<{
      trackedEntities: bigint;
      secListedUniverse: bigint;
      litigationLinkedCompanies: bigint;
      riskScoredCompanies: bigint;
      unresolvedObservedParties: bigint;
      cases: bigint;
      activeAlerts: bigint;
    }>
  >`
    SELECT
      (SELECT COUNT(*) FROM companies) AS "trackedEntities",
      (SELECT COUNT(*) FROM company_master WHERE universe @> ARRAY['sec_listed']::TEXT[]) AS "secListedUniverse",
      (SELECT COUNT(DISTINCT "companyId") FROM company_case_link) AS "litigationLinkedCompanies",
      (SELECT COUNT(DISTINCT "companyId") FROM risk_scores WHERE "scoreVersion" = 'v3') AS "riskScoredCompanies",
      (SELECT COUNT(*) FROM observed_parties op WHERE NOT EXISTS (
        SELECT 1 FROM entity_matches em WHERE em."observedPartyId" = op.id
      )) AS "unresolvedObservedParties",
      (SELECT COUNT(*) FROM cases) AS cases,
      (SELECT COUNT(*) FROM alerts) AS "activeAlerts"
  `;

  return {
    trackedEntities: Number(summary.trackedEntities),
    ...summarizeDashboardEntityCounts({
      secListedUniverse: Number(summary.secListedUniverse),
      litigationLinkedCompanies: Number(summary.litigationLinkedCompanies),
      riskScoredCompanies: Number(summary.riskScoredCompanies),
      unresolvedObservedParties: Number(summary.unresolvedObservedParties),
    }),
    cases: Number(summary.cases),
    activeAlerts: Number(summary.activeAlerts),
  };
}
