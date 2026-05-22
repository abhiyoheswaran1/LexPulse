import { describe, expect, test } from "vitest";
import {
  DEFAULT_PROMOTION_THRESHOLDS,
  isMeaningfulPromotionCandidate,
  summarizeDashboardEntityCounts,
} from "@/lib/company-promotion";

describe("company promotion helpers", () => {
  test("promotes only high-confidence auto-accepted candidates with case evidence", () => {
    expect(
      isMeaningfulPromotionCandidate({
        distinctCases: 1,
        autoAcceptedHighMatches: 1,
        maxScore: DEFAULT_PROMOTION_THRESHOLDS.minScore,
      }),
    ).toBe(true);

    expect(
      isMeaningfulPromotionCandidate({
        distinctCases: 0,
        autoAcceptedHighMatches: 1,
        maxScore: 0.96,
      }),
    ).toBe(false);

    expect(
      isMeaningfulPromotionCandidate({
        distinctCases: 2,
        autoAcceptedHighMatches: 0,
        maxScore: 0.96,
      }),
    ).toBe(false);

    expect(
      isMeaningfulPromotionCandidate({
        distinctCases: 2,
        autoAcceptedHighMatches: 1,
        maxScore: 0.91,
      }),
    ).toBe(false);
  });

  test("supports stricter case thresholds for bulk backfills", () => {
    expect(
      isMeaningfulPromotionCandidate(
        {
          distinctCases: 1,
          autoAcceptedHighMatches: 1,
          maxScore: 0.96,
        },
        { ...DEFAULT_PROMOTION_THRESHOLDS, minDistinctCases: 2 },
      ),
    ).toBe(false);
  });

  test("keeps dashboard entity counts explicit", () => {
    expect(
      summarizeDashboardEntityCounts({
        secListedUniverse: 7981,
        sp1500Universe: 1500,
        russell3000Universe: 3000,
        litigationLinkedCompanies: 6975,
        riskScoredCompanies: 6969,
        unresolvedObservedParties: 4905,
      }),
    ).toEqual({
      secListedUniverse: 7981,
      sp1500Universe: 1500,
      russell3000Universe: 3000,
      litigationLinkedCompanies: 6975,
      riskScoredCompanies: 6969,
      unresolvedObservedParties: 4905,
    });
  });
});
