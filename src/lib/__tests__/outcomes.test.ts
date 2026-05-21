import { describe, expect, test } from "vitest";
import { classifyLegalOutcome, classifyMaterialEvent } from "@/lib/outcomes";

describe("outcome classification", () => {
  test("classifies dismissal language", () => {
    expect(classifyLegalOutcome("ORDER granting motion to dismiss with prejudice")).toMatchObject({
      outcomeType: "dismissed",
      confidence: 0.9,
    });
  });

  test("classifies settlement language", () => {
    expect(classifyLegalOutcome("The parties reached a settlement agreement and the action was terminated")).toMatchObject({
      outcomeType: "settled",
      confidence: 0.85,
    });
  });

  test("classifies judgment and injunction language", () => {
    expect(classifyLegalOutcome("Final judgment entered against the defendant")).toMatchObject({
      outcomeType: "judgment",
    });
    expect(classifyLegalOutcome("Court grants permanent injunction")).toMatchObject({
      outcomeType: "injunction",
    });
  });

  test("keeps weak termination-only evidence low confidence", () => {
    expect(classifyLegalOutcome("Civil case terminated")).toEqual({
      outcomeType: "terminated",
      confidence: 0.4,
      matchedText: "terminated",
    });
  });
});

describe("material event classification", () => {
  test("classifies regulator complaints and final judgments", () => {
    expect(classifyMaterialEvent("SEC filed a complaint in federal court alleging securities fraud")).toMatchObject({
      eventType: "regulatory_complaint",
      confidence: 0.85,
    });
    expect(classifyMaterialEvent("The Commission announced a final judgment and civil penalty")).toMatchObject({
      eventType: "regulatory_resolution",
      confidence: 0.8,
    });
  });

  test("extracts rough monetary penalties when present", () => {
    expect(classifyMaterialEvent("Company will pay a $3.7 billion civil money penalty")).toMatchObject({
      amountUsd: "3700000000.00",
    });
  });
});
