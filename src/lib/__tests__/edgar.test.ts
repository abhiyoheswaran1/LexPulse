import { describe, it, expect } from "vitest";
import {
  padCik,
  accessionNoDashes,
  parseCompanyTickers,
  parseSubmissions,
  isLitigationRelevant8K,
  htmlToText,
  buildItemTextExcerpt,
} from "../edgar";

describe("padCik", () => {
  it("zero-pads numeric CIK to 10 digits", () => {
    expect(padCik(320193)).toBe("0000320193");
  });

  it("accepts string CIKs", () => {
    expect(padCik("789019")).toBe("0000789019");
  });

  it("rejects garbage", () => {
    expect(() => padCik("abc")).toThrow();
    expect(() => padCik(0)).toThrow();
    expect(() => padCik(-1)).toThrow();
  });
});

describe("accessionNoDashes", () => {
  it("strips dashes from accession number", () => {
    expect(accessionNoDashes("0001628280-24-008534")).toBe("000162828024008534");
  });
});

describe("parseCompanyTickers", () => {
  it("flattens SEC's row-keyed object into entries", () => {
    const raw = {
      "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
      "1": { cik_str: 789019, ticker: "MSFT", title: "Microsoft Corporation" },
    };
    const out = parseCompanyTickers(raw);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      cik: "0000320193",
      ticker: "AAPL",
      title: "Apple Inc.",
      normKey: "apple",
    });
    expect(out[1].ticker).toBe("MSFT");
    expect(out[1].normKey).toBe("microsoft");
  });

  it("normalizes corporate suffixes so EDGAR titles match our normKey", () => {
    const raw = {
      "0": { cik_str: 1, ticker: "X", title: "Acme Holdings, Inc." },
    };
    expect(parseCompanyTickers(raw)[0].normKey).toBe("acme");
  });

  it("skips malformed rows without throwing", () => {
    const raw = {
      "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
      "1": null,
      "2": { cik_str: "not-a-number", ticker: "BAD", title: "Bad" },
      "3": { cik_str: 1, ticker: "", title: "Empty Ticker Inc." },
      "4": { cik_str: 1, ticker: "OK", title: "" },
    };
    const out = parseCompanyTickers(raw);
    expect(out).toHaveLength(1);
    expect(out[0].ticker).toBe("AAPL");
  });

  it("returns empty array on bad input", () => {
    expect(parseCompanyTickers(null)).toEqual([]);
    expect(parseCompanyTickers("not an object")).toEqual([]);
  });
});

describe("parseSubmissions", () => {
  it("zips parallel arrays into per-filing records", () => {
    const raw = {
      filings: {
        recent: {
          accessionNumber: ["0001-24-001", "0001-24-002"],
          form: ["8-K", "10-Q"],
          filingDate: ["2024-03-15", "2024-05-01"],
          primaryDocument: ["doc1.htm", "doc2.htm"],
          items: ["1.01,8.01", ""],
        },
      },
    };
    const out = parseSubmissions(raw);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      accession: "0001-24-001",
      formType: "8-K",
      filedAt: new Date("2024-03-15"),
      primaryDocument: "doc1.htm",
      items: ["1.01", "8.01"],
    });
    expect(out[1].items).toEqual([]);
  });

  it("skips rows with bad dates", () => {
    const raw = {
      filings: {
        recent: {
          accessionNumber: ["a", "b"],
          form: ["8-K", "8-K"],
          filingDate: ["2024-01-01", "not-a-date"],
        },
      },
    };
    expect(parseSubmissions(raw)).toHaveLength(1);
  });

  it("returns empty on missing structure", () => {
    expect(parseSubmissions({})).toEqual([]);
    expect(parseSubmissions({ filings: {} })).toEqual([]);
    expect(parseSubmissions(null)).toEqual([]);
  });
});

describe("isLitigationRelevant8K", () => {
  it("detects relevant items by code", () => {
    expect(isLitigationRelevant8K(["8.01"])).toBe(true);
    expect(isLitigationRelevant8K(["1.01"])).toBe(true);
    expect(isLitigationRelevant8K(["2.02"])).toBe(false); // earnings
  });

  it("strips Item prefix when SEC uses verbose form", () => {
    expect(isLitigationRelevant8K(["Item 8.01"])).toBe(true);
  });

  it("returns true if any item in the list is relevant", () => {
    expect(isLitigationRelevant8K(["2.02", "8.01"])).toBe(true);
  });
});

describe("htmlToText", () => {
  it("strips tags and normalizes whitespace", () => {
    const html = "<div><p>The Company <b>settled</b> a&nbsp;lawsuit.</p></div>";
    expect(htmlToText(html)).toBe("The Company settled a lawsuit.");
  });

  it("converts <br> and </p> to newlines that get collapsed to spaces", () => {
    expect(htmlToText("<p>One</p><p>Two</p>")).toBe("One Two");
  });

  it("strips script and style blocks entirely", () => {
    const html = '<style>.a{color:red}</style><script>alert(1)</script><p>Hi</p>';
    expect(htmlToText(html)).toBe("Hi");
  });

  it("decodes named and numeric entities", () => {
    expect(htmlToText("Foo &amp; Bar &#36; 100")).toBe("Foo & Bar $ 100");
  });
});

describe("buildItemTextExcerpt", () => {
  it("returns full text under the cap", () => {
    expect(buildItemTextExcerpt("short text", 100)).toBe("short text");
  });

  it("centers excerpt on a litigation hotspot when text exceeds cap", () => {
    const lead = "x".repeat(2000);
    const trail = "y".repeat(2000);
    const text = `${lead} the Company entered into a settlement agreement ${trail}`;
    const excerpt = buildItemTextExcerpt(text, 200);
    expect(excerpt.length).toBeLessThanOrEqual(200);
    expect(excerpt).toContain("settlement");
  });

  it("falls back to head of document when no hotspot is present", () => {
    const text = "a".repeat(5000);
    const excerpt = buildItemTextExcerpt(text, 1000);
    expect(excerpt.length).toBe(1000);
    expect(excerpt).toBe("a".repeat(1000));
  });
});
