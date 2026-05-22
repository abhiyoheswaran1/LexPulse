import { describe, expect, test } from "vitest";
import { classifyEntityName, chooseCanonicalCompany, shouldMergeCompanyPair, type MergeCandidate } from "@/lib/entity-quality";

describe("entity quality", () => {
  test("quarantines procedural artifacts", () => {
    expect(classifyEntityName("Sealed Search Warrant and Application for Order Commanding Apple Inc.")).toMatchObject({
      displayStatus: "quarantined",
      reason: "procedural_artifact",
    });
    expect(classifyEntityName("Facebook Username: user.123 stored at premises controlled by Meta Platforms, Inc.")).toMatchObject({
      displayStatus: "quarantined",
      reason: "procedural_artifact",
    });
  });

  test("keeps company-like entities visible", () => {
    expect(classifyEntityName("Walmart Inc.")).toEqual({ displayStatus: "visible", reason: null });
    expect(classifyEntityName("JPMORGAN CHASE BANK, N.A.")).toEqual({ displayStatus: "visible", reason: null });
  });

  test("chooses canonical duplicate by public identity, linked cases, and name quality", () => {
    const candidates: MergeCandidate[] = [
      { id: "subsidiary", name: "Walmart", ticker: null, cik: null, caseCount: 1200, scoreCount: 4, createdAt: new Date("2026-01-01") },
      { id: "public", name: "WALMART STORES INC", ticker: "WMT", cik: "0000104169", caseCount: 900, scoreCount: 8, createdAt: new Date("2026-02-01") },
      { id: "tiny", name: "WMT", ticker: "WMT", cik: null, caseCount: 2, scoreCount: 1, createdAt: new Date("2026-03-01") },
    ];

    expect(chooseCanonicalCompany(candidates)?.id).toBe("public");
  });

  test("allows conservative parent, ticker, and brand-name duplicate merges", () => {
    expect(
      shouldMergeCompanyPair(
        candidate("canonical", "WALMART STORES INC", "WMT", "0000104169"),
        candidate("duplicate", "Walmart", null, null),
      ),
    ).toBe(true);

    expect(
      shouldMergeCompanyPair(
        candidate("canonical", "Meta Platforms, Inc.", "META", "0001326801"),
        candidate("duplicate", "META", null, null),
      ),
    ).toBe(true);

    expect(
      shouldMergeCompanyPair(
        candidate("canonical", "Duke Energy Corporation", "DUK", "0001326160"),
        candidate("duplicate", "Duke Energy Carolinas, LLC", null, null),
      ),
    ).toBe(true);
  });

  test("rejects same-master rows when names are unrelated or ambiguously similar", () => {
    expect(
      shouldMergeCompanyPair(
        candidate("canonical", "General Electric Company", "GE", "0000040545"),
        candidate("duplicate", "General Motors LLC", "GM", "0001467858"),
      ),
    ).toBe(false);

    expect(
      shouldMergeCompanyPair(
        candidate("canonical", "THE SMALL BUSINESS BANKING DEPARTMENT OF THE BANK OF AMERICA", null, null),
        candidate("duplicate", "The Boeing Company", "BA", "0000012927"),
      ),
    ).toBe(false);

    expect(
      shouldMergeCompanyPair(
        candidate("canonical", "BlackRock Coal, LLC", null, "0000000001"),
        candidate("duplicate", "Blackrock, Inc.", null, null),
      ),
    ).toBe(false);
  });
});

function candidate(id: string, name: string, ticker: string | null, cik: string | null): MergeCandidate {
  return {
    id,
    name,
    ticker,
    cik,
    caseCount: 1,
    scoreCount: 1,
    createdAt: new Date("2026-01-01"),
  };
}
