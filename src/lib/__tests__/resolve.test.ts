import { describe, it, expect } from "vitest";
import { normalizeCompanyName, looksLikeCompany, classifyRole } from "../resolve";

describe("normalizeCompanyName", () => {
  it("collapses corporate suffix variations to one key", () => {
    expect(normalizeCompanyName("Apple Inc.").key).toBe("apple");
    expect(normalizeCompanyName("APPLE CORPORATION").key).toBe("apple");
    expect(normalizeCompanyName("Apple, Inc.").key).toBe("apple");
    expect(normalizeCompanyName("The Apple Company").key).toBe("apple");
  });

  it("preserves the display string with original casing/spacing", () => {
    expect(normalizeCompanyName("  Apple   Inc.  ").display).toBe("Apple Inc.");
  });
});

describe("looksLikeCompany", () => {
  it("accepts names with corp suffixes", () => {
    expect(looksLikeCompany("Acme Corp.")).toBe(true);
    expect(looksLikeCompany("Foo LLC")).toBe(true);
    expect(looksLikeCompany("Bar Limited")).toBe(true);
  });

  it("accepts names with corporate keywords", () => {
    expect(looksLikeCompany("Acme Industries")).toBe(true);
    expect(looksLikeCompany("Northwind Energy")).toBe(true);
    expect(looksLikeCompany("Helix Pharmaceuticals")).toBe(true);
  });

  it("accepts marquee Russell-1000 names without suffix", () => {
    expect(looksLikeCompany("Apple")).toBe(true);
    expect(looksLikeCompany("Tesla")).toBe(true);
    expect(looksLikeCompany("Pfizer")).toBe(true);
    expect(looksLikeCompany("Microsoft")).toBe(true);
    expect(looksLikeCompany("ExxonMobil")).toBe(true);
    expect(looksLikeCompany("Merck")).toBe(true);
    expect(looksLikeCompany("Disney")).toBe(true);
  });

  it("rejects individual-name patterns", () => {
    expect(looksLikeCompany("John Doe")).toBe(false);
    expect(looksLikeCompany("Jane Doe")).toBe(false);
    expect(looksLikeCompany("Doe et al")).toBe(false);
    expect(looksLikeCompany("Doe et al.")).toBe(false);
    expect(looksLikeCompany("In re Smith")).toBe(false);
    expect(looksLikeCompany("Estate of Adams")).toBe(false);
  });

  it("rejects Schedule A defendant composites (federal IP litigation pattern)", () => {
    expect(
      looksLikeCompany(
        "The Individuals, Corporations, Limited Liability Companies, Partnerships, and Unincorporated Associations Identified on Schedule A",
      ),
    ).toBe(false);
    expect(looksLikeCompany("Defendants Identified on Schedule A")).toBe(false);
    expect(looksLikeCompany("Schedule A Defendants")).toBe(false);
  });

  it("rejects names longer than 200 chars (docket composites, never a single company)", () => {
    const longName = "Acme Corp, Foo LLC, Bar Inc, Baz Ltd, ".repeat(10);
    expect(longName.length).toBeGreaterThan(200);
    expect(looksLikeCompany(longName)).toBe(false);
  });

  it("rejects empty / whitespace", () => {
    expect(looksLikeCompany("")).toBe(false);
    expect(looksLikeCompany("   ")).toBe(false);
  });
});

describe("classifyRole", () => {
  it("classifies plaintiff aliases", () => {
    expect(classifyRole("Plaintiff")).toBe("plaintiff");
    expect(classifyRole("Petitioner")).toBe("plaintiff");
    expect(classifyRole("APPELLANT")).toBe("plaintiff");
  });

  it("classifies defendant aliases", () => {
    expect(classifyRole("Defendant")).toBe("defendant");
    expect(classifyRole("Respondent")).toBe("defendant");
    expect(classifyRole("Appellee")).toBe("defendant");
  });

  it("falls back to other", () => {
    expect(classifyRole("Cross-claimant")).toBe("other");
    expect(classifyRole("")).toBe("other");
  });
});
