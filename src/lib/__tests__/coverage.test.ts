import { describe, expect, test } from "vitest";
import { summarizeCoverage, type CoverageInput } from "@/lib/coverage";

describe("coverage summary", () => {
  test("computes coverage rates and confidence buckets", () => {
    const input: CoverageInput = {
      companyMasters: 100,
      secListed: 80,
      sp1500: 10,
      russell3000: 20,
      observedParties: 50,
      matchedParties: 35,
      unresolvedParties: 15,
      highConfidenceMatches: 25,
      mediumConfidenceMatches: 8,
      lowConfidenceMatches: 2,
      caseOutcomes: 12,
      externalEvents: 6,
      staleSources: 1,
      failedRuns24h: 2,
    };

    expect(summarizeCoverage(input)).toEqual({
      companyMasters: 100,
      universe: {
        secListed: 80,
        sp1500: 10,
        russell3000: 20,
      },
      parties: {
        observed: 50,
        matched: 35,
        unresolved: 15,
        matchRate: 0.7,
      },
      confidence: {
        high: 25,
        medium: 8,
        low: 2,
      },
      enrichment: {
        caseOutcomes: 12,
        externalEvents: 6,
      },
      operations: {
        staleSources: 1,
        failedRuns24h: 2,
        needsAttention: true,
      },
    });
  });

  test("handles zero observed parties without NaN rates", () => {
    expect(
      summarizeCoverage({
        companyMasters: 0,
        secListed: 0,
        sp1500: 0,
        russell3000: 0,
        observedParties: 0,
        matchedParties: 0,
        unresolvedParties: 0,
        highConfidenceMatches: 0,
        mediumConfidenceMatches: 0,
        lowConfidenceMatches: 0,
        caseOutcomes: 0,
        externalEvents: 0,
        staleSources: 0,
        failedRuns24h: 0,
      }),
    ).toMatchObject({
      parties: { matchRate: 0 },
      operations: { needsAttention: false },
    });
  });
});
