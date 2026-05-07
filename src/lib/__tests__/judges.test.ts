import { describe, it, expect } from "vitest";
import { judgeMultiplier, aggregateJudgeMultiplier, type JudgeProfileLite } from "../judges";

describe("judgeMultiplier", () => {
  it("returns 1.0 (neutral) for null profile", () => {
    expect(judgeMultiplier(null)).toBe(1.0);
  });

  it("returns 1.0 for under-sampled profile (caseCount < 5)", () => {
    const profile: JudgeProfileLite = { dismissalRate: 0.5, caseCount: 3 };
    expect(judgeMultiplier(profile)).toBe(1.0);
  });

  it("returns 1.0 when dismissalRate is null", () => {
    const profile: JudgeProfileLite = { dismissalRate: null, caseCount: 100 };
    expect(judgeMultiplier(profile)).toBe(1.0);
  });

  it("low dismissal → high multiplier (~1.10)", () => {
    const profile: JudgeProfileLite = { dismissalRate: 0.10, caseCount: 100 };
    expect(judgeMultiplier(profile)).toBeCloseTo(1.10, 2);
  });

  it("high dismissal → low multiplier (~0.92)", () => {
    const profile: JudgeProfileLite = { dismissalRate: 0.60, caseCount: 100 };
    expect(judgeMultiplier(profile)).toBeCloseTo(0.92, 2);
  });

  it("median (~0.35 dismissal) → near-neutral", () => {
    const profile: JudgeProfileLite = { dismissalRate: 0.35, caseCount: 100 };
    const m = judgeMultiplier(profile);
    expect(m).toBeGreaterThan(0.99);
    expect(m).toBeLessThan(1.02);
  });

  it("clamps to [0.92, 1.10]", () => {
    expect(judgeMultiplier({ dismissalRate: 0, caseCount: 50 })).toBe(1.10);
    expect(judgeMultiplier({ dismissalRate: 1, caseCount: 50 })).toBe(0.92);
  });
});

describe("aggregateJudgeMultiplier", () => {
  it("averages over case-judge pairs (cases with no judge contribute 1.0)", () => {
    const profiles: Map<string, JudgeProfileLite> = new Map([
      ["j1", { dismissalRate: 0.10, caseCount: 50 }], // 1.10
      ["j2", { dismissalRate: 0.60, caseCount: 50 }], // 0.92
    ]);
    const cases = [
      { judgeId: "j1" }, // 1.10
      { judgeId: "j2" }, // 0.92
      { judgeId: null }, // 1.00
    ];
    const m = aggregateJudgeMultiplier(cases, profiles);
    expect(m).toBeCloseTo((1.10 + 0.92 + 1.0) / 3, 3);
  });

  it("returns 1.0 when no cases", () => {
    expect(aggregateJudgeMultiplier([], new Map())).toBe(1.0);
  });

  it("returns 1.0 when no judges have profiles", () => {
    const cases = [{ judgeId: "j1" }, { judgeId: "j2" }];
    expect(aggregateJudgeMultiplier(cases, new Map())).toBe(1.0);
  });
});
