export type CoverageInput = {
  companyMasters: number;
  secListed: number;
  sp1500: number;
  russell3000: number;
  observedParties: number;
  matchedParties: number;
  unresolvedParties: number;
  highConfidenceMatches: number;
  mediumConfidenceMatches: number;
  lowConfidenceMatches: number;
  caseOutcomes: number;
  externalEvents: number;
  staleSources: number;
  failedRuns24h: number;
};

export type CoverageSummary = ReturnType<typeof summarizeCoverage>;

export function summarizeCoverage(input: CoverageInput) {
  const matchRate = input.observedParties > 0 ? round(input.matchedParties / input.observedParties) : 0;
  return {
    companyMasters: input.companyMasters,
    universe: {
      secListed: input.secListed,
      sp1500: input.sp1500,
      russell3000: input.russell3000,
    },
    parties: {
      observed: input.observedParties,
      matched: input.matchedParties,
      unresolved: input.unresolvedParties,
      matchRate,
    },
    confidence: {
      high: input.highConfidenceMatches,
      medium: input.mediumConfidenceMatches,
      low: input.lowConfidenceMatches,
    },
    enrichment: {
      caseOutcomes: input.caseOutcomes,
      externalEvents: input.externalEvents,
    },
    operations: {
      staleSources: input.staleSources,
      failedRuns24h: input.failedRuns24h,
      needsAttention: input.staleSources > 0 || input.failedRuns24h > 0,
    },
  };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
