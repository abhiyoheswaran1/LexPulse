import { describe, it, expect } from "vitest";
import { classifyMaterialEvents, extractAmountUsd } from "../material-events";

describe("classifyMaterialEvents", () => {
  it("returns empty for empty text", () => {
    expect(classifyMaterialEvents("")).toEqual([]);
  });

  it("detects a settlement disclosure", () => {
    const text =
      "On March 15, 2024, the Company agreed to settle the matter without admission of liability for $50 million.";
    const out = classifyMaterialEvents(text);
    expect(out.find((e) => e.eventType === "settlement_disclosed")).toBeDefined();
    // Two distinct settlement signals should bump confidence to 0.9
    expect(out.find((e) => e.eventType === "settlement_disclosed")!.confidence).toBe(0.9);
  });

  it("extracts disclosed dollar amounts on settlements", () => {
    const text = "The Company agreed to settle for $250 million in full settlement of the claims.";
    const out = classifyMaterialEvents(text);
    const settlement = out.find((e) => e.eventType === "settlement_disclosed");
    expect(settlement?.amountUsd).toBe(250_000_000);
  });

  it("detects a putative class action filing", () => {
    const text = "Plaintiffs filed a putative class action against the Company alleging securities fraud.";
    const out = classifyMaterialEvents(text);
    expect(out.find((e) => e.eventType === "litigation_filed")).toBeDefined();
  });

  it("detects a Wells notice as a regulatory inquiry", () => {
    const text = "On April 1, 2024, the Company received a Wells notice from the SEC staff.";
    const out = classifyMaterialEvents(text);
    expect(out.find((e) => e.eventType === "regulatory_inquiry")).toBeDefined();
  });

  it("detects judgment against the Company", () => {
    const text =
      "The court ordered the Company to pay damages. Judgment was entered against the Company on June 5, 2024.";
    const out = classifyMaterialEvents(text);
    expect(out.find((e) => e.eventType === "judgment_against")).toBeDefined();
    expect(out.find((e) => e.eventType === "judgment_against")!.confidence).toBe(0.9);
  });

  it("detects judgment for the Company", () => {
    const text =
      "Summary judgment was granted in favor of the Company; the case was dismissed with prejudice.";
    const out = classifyMaterialEvents(text);
    expect(out.find((e) => e.eventType === "judgment_for")).toBeDefined();
  });

  it("detects a dismissal", () => {
    const text = "The motion to dismiss was granted. The case was dismissed in its entirety.";
    const out = classifyMaterialEvents(text);
    expect(out.find((e) => e.eventType === "dismissed")).toBeDefined();
  });

  it("does not fire on quarterly results boilerplate", () => {
    const text =
      "The Company reported revenue of $5.2 billion in the third quarter, an increase of 12% year-over-year. " +
      "Adjusted earnings per share were $1.45.";
    const out = classifyMaterialEvents(text);
    // no litigation events should fire from earnings text
    expect(out.filter((e) => e.eventType !== "other_litigation")).toEqual([]);
  });

  it("can fire multiple distinct event types in one filing", () => {
    const text =
      "On March 1, the plaintiffs filed a lawsuit against the Company. On May 15, the Company agreed to settle the matter.";
    const out = classifyMaterialEvents(text);
    const types = new Set(out.map((e) => e.eventType));
    expect(types.has("litigation_filed")).toBe(true);
    expect(types.has("settlement_disclosed")).toBe(true);
  });

  it("snippet is bounded and human-readable", () => {
    const lead = "x".repeat(500);
    const trail = "y".repeat(500);
    const text = `${lead} the Company agreed to settle the matter ${trail}`;
    const out = classifyMaterialEvents(text);
    const settlement = out.find((e) => e.eventType === "settlement_disclosed");
    expect(settlement).toBeDefined();
    expect(settlement!.snippet.length).toBeLessThanOrEqual(220);
    expect(settlement!.snippet).toContain("settle");
  });
});

describe("extractAmountUsd", () => {
  it("parses bare millions", () => {
    expect(extractAmountUsd("$100 million")).toBe(100_000_000);
  });

  it("parses billions", () => {
    expect(extractAmountUsd("approximately $1.5 billion")).toBe(1_500_000_000);
  });

  it("parses single-letter unit shortcuts", () => {
    expect(extractAmountUsd("approximately $3.2m in damages")).toBe(3_200_000);
    expect(extractAmountUsd("$450k filing fee")).toBe(450_000);
  });

  it("parses bare dollar amounts with commas", () => {
    expect(extractAmountUsd("$250,000")).toBe(250_000);
  });

  it("picks the largest amount when multiple appear", () => {
    expect(
      extractAmountUsd("a $5,000 court fee plus $50 million in damages")
    ).toBe(50_000_000);
  });

  it("returns null when no amount", () => {
    expect(extractAmountUsd("the Company settled the matter")).toBeNull();
  });
});
