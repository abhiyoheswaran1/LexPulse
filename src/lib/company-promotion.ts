export type PromotionThresholds = {
  minDistinctCases: number;
  minScore: number;
};

export type PromotionCandidateSummary = {
  distinctCases: number;
  autoAcceptedHighMatches: number;
  maxScore: number;
};

export type DashboardEntityCountsInput = {
  secListedUniverse: number;
  sp1500Universe: number;
  russell3000Universe: number;
  litigationLinkedCompanies: number;
  riskScoredCompanies: number;
  unresolvedObservedParties: number;
};

export const DEFAULT_PROMOTION_THRESHOLDS: PromotionThresholds = {
  minDistinctCases: 1,
  minScore: 0.92,
};

export function isMeaningfulPromotionCandidate(
  candidate: PromotionCandidateSummary,
  thresholds: PromotionThresholds = DEFAULT_PROMOTION_THRESHOLDS,
) {
  return (
    candidate.distinctCases >= thresholds.minDistinctCases &&
    candidate.autoAcceptedHighMatches > 0 &&
    candidate.maxScore >= thresholds.minScore
  );
}

export function summarizeDashboardEntityCounts(input: DashboardEntityCountsInput): DashboardEntityCountsInput {
  return {
    secListedUniverse: Math.max(0, Math.trunc(input.secListedUniverse)),
    sp1500Universe: Math.max(0, Math.trunc(input.sp1500Universe)),
    russell3000Universe: Math.max(0, Math.trunc(input.russell3000Universe)),
    litigationLinkedCompanies: Math.max(0, Math.trunc(input.litigationLinkedCompanies)),
    riskScoredCompanies: Math.max(0, Math.trunc(input.riskScoredCompanies)),
    unresolvedObservedParties: Math.max(0, Math.trunc(input.unresolvedObservedParties)),
  };
}
