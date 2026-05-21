import { describe, expect, test } from "vitest";
import { rankCompanyMatches, type MatchCandidate } from "@/lib/entity-resolution";

const candidates: MatchCandidate[] = [
  {
    companyMasterId: "master_apple",
    name: "Apple Inc.",
    normKey: "apple",
    ticker: "AAPL",
    cik: "0000320193",
    aliases: [
      { normKey: "apple", alias: "Apple Inc.", confidence: 1 },
      { normKey: "apple computer", alias: "Apple Computer", confidence: 0.9 },
    ],
  },
  {
    companyMasterId: "master_appfolio",
    name: "AppFolio, Inc.",
    normKey: "appfolio",
    ticker: "APPF",
    cik: "0001433195",
    aliases: [{ normKey: "appfolio", alias: "AppFolio", confidence: 1 }],
  },
];

describe("entity resolution", () => {
  test("auto-accepts exact alias matches", () => {
    const [match] = rankCompanyMatches("Apple Inc.", candidates);
    expect(match).toMatchObject({
      companyMasterId: "master_apple",
      method: "alias_exact",
      confidence: "high",
      reviewStatus: "auto_accepted",
    });
    expect(match.score).toBeGreaterThanOrEqual(0.97);
  });

  test("treats subsidiary/prefix matches as reviewable medium-confidence matches", () => {
    const [match] = rankCompanyMatches("Apple Payments Services LLC", candidates);
    expect(match).toMatchObject({
      companyMasterId: "master_apple",
      method: "prefix_subsidiary",
      confidence: "medium",
      reviewStatus: "pending",
    });
    expect(match.score).toBeGreaterThanOrEqual(0.75);
    expect(match.score).toBeLessThan(0.92);
  });

  test("does not over-match weak token overlap", () => {
    const matches = rankCompanyMatches("Application Security Partners LLC", candidates);
    expect(matches[0]?.reviewStatus).toBe("rejected");
    expect(matches[0]?.confidence).toBe("low");
  });

  test("flags near ties as ambiguous", () => {
    const ambiguousCandidates: MatchCandidate[] = [
      {
        companyMasterId: "m1",
        name: "United Bankshares Inc.",
        normKey: "united bankshares",
        ticker: "UBSI",
        cik: null,
        aliases: [{ normKey: "united bank", alias: "United Bank", confidence: 0.9 }],
      },
      {
        companyMasterId: "m2",
        name: "United Bancorp Inc.",
        normKey: "united bancorp",
        ticker: "UBCP",
        cik: null,
        aliases: [{ normKey: "united bank", alias: "United Bank", confidence: 0.9 }],
      },
    ];

    const [first, second] = rankCompanyMatches("United Bank", ambiguousCandidates);
    expect(first.reviewStatus).toBe("ambiguous");
    expect(second.reviewStatus).toBe("ambiguous");
  });
});
