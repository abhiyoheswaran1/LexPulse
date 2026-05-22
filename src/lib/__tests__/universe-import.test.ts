import { describe, expect, test } from "vitest";
import { parseUniverseCsvRows, universeTagForIndex } from "@/lib/universe-import";

describe("universe import helpers", () => {
  test("maps supported index names to stable universe tags", () => {
    expect(universeTagForIndex("sp1500")).toBe("sp1500_import");
    expect(universeTagForIndex("s&p 1500")).toBe("sp1500_import");
    expect(universeTagForIndex("russell3000")).toBe("russell3000_import");
    expect(universeTagForIndex("Russell 3000")).toBe("russell3000_import");
  });

  test("parses ticker, name, and cik columns from constituent CSV rows", () => {
    expect(
      parseUniverseCsvRows([
        { Symbol: "wmt", Name: "Walmart Inc.", CIK: "104169" },
        { ticker: "brk-b", company: "Berkshire Hathaway Inc.", cik: "" },
      ]),
    ).toEqual([
      { ticker: "WMT", name: "Walmart Inc.", cik: "0000104169" },
      { ticker: "BRK.B", name: "Berkshire Hathaway Inc.", cik: null },
    ]);
  });
});
