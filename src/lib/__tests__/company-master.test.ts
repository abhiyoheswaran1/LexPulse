import { describe, expect, test } from "vitest";
import {
  aliasesForCompany,
  normalizeTicker,
  parseSecCompanyTickersExchange,
  universeTagsFromRow,
} from "@/lib/company-master";

describe("company master helpers", () => {
  test("parses SEC company_tickers_exchange rows into canonical master records", () => {
    const json = {
      fields: ["cik", "name", "ticker", "exchange"],
      data: [
        [320193, "Apple Inc.", "AAPL", "Nasdaq"],
        [789019, "MICROSOFT CORP", "MSFT", "Nasdaq"],
      ],
    };

    expect(parseSecCompanyTickersExchange(json)).toEqual([
      {
        cik: "0000320193",
        name: "Apple Inc.",
        normKey: "apple",
        ticker: "AAPL",
        exchange: "NASDAQ",
        source: "sec_company_tickers_exchange",
        universe: ["sec_listed"],
      },
      {
        cik: "0000789019",
        name: "MICROSOFT CORP",
        normKey: "microsoft",
        ticker: "MSFT",
        exchange: "NASDAQ",
        source: "sec_company_tickers_exchange",
        universe: ["sec_listed"],
      },
    ]);
  });

  test("normalizes tickers without losing share-class separators", () => {
    expect(normalizeTicker(" brk.b ")).toBe("BRK.B");
    expect(normalizeTicker("BF-B")).toBe("BF.B");
    expect(normalizeTicker("")).toBe(null);
  });

  test("builds matching aliases from canonical names and tickers", () => {
    expect(aliasesForCompany({ name: "The Goldman Sachs Group Inc.", ticker: "GS" })).toEqual([
      { alias: "The Goldman Sachs Group Inc.", normKey: "goldman sachs", source: "canonical_name", confidence: 1 },
      { alias: "Goldman Sachs", normKey: "goldman sachs", source: "suffix_stripped", confidence: 0.96 },
      { alias: "GS", normKey: "gs", source: "ticker", confidence: 0.92 },
    ]);
  });

  test("maps optional universe import rows to stable tags", () => {
    expect(universeTagsFromRow({ universe: "Russell 3000" })).toEqual(["russell3000_import"]);
    expect(universeTagsFromRow({ index: "S&P 1500" })).toEqual(["sp1500_import"]);
    expect(universeTagsFromRow({ universe: "Watchlist" })).toEqual(["watchlist_import"]);
  });
});
