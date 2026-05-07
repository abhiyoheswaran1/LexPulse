import { describe, it, expect } from "vitest";
import { categorize, severityForCategory, severityForNos, NOS_CATEGORY } from "../case-types";

describe("case-types", () => {
  it("classifies known NOS codes", () => {
    expect(categorize("850")).toBe("securities");
    expect(categorize("410")).toBe("antitrust");
    expect(categorize("830")).toBe("ip_patent");
    expect(categorize("442")).toBe("civil_rights");
    expect(categorize("110")).toBe("contract");
  });

  it("falls back to 'other' for unknown codes", () => {
    expect(categorize("999")).toBe("other");
    expect(categorize(null)).toBe("other");
    expect(categorize(undefined)).toBe("other");
    expect(categorize("")).toBe("other");
  });

  it("classifies free-text labels", () => {
    expect(categorize("Securities Fraud")).toBe("securities");
    expect(categorize("antitrust")).toBe("antitrust");
    expect(categorize("Patent Infringement")).toBe("ip_patent");
    expect(categorize("Employment - Class Action")).toBe("employment_labor");
  });

  it("severityForCategory returns expected weights", () => {
    expect(severityForCategory("securities")).toBeGreaterThanOrEqual(0.9);
    expect(severityForCategory("contract")).toBeLessThanOrEqual(0.4);
    expect(severityForCategory("other")).toBe(0.3);
  });

  it("severityForNos handles null and label and code", () => {
    expect(severityForNos(null)).toBe(0.3);
    expect(severityForNos("850")).toBeGreaterThanOrEqual(0.9);
    expect(severityForNos("Securities Fraud")).toBeGreaterThanOrEqual(0.9);
  });

  it("NOS_CATEGORY covers at least 50 codes", () => {
    expect(Object.keys(NOS_CATEGORY).length).toBeGreaterThanOrEqual(50);
  });
});
