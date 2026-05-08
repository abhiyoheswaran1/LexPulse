import { describe, it, expect } from "vitest";
import { computeRisk, computeRiskV2, computeRiskV3, deriveSubScores, type CaseLite, type CaseLiteV2, type CaseLiteV3, type RiskBreakdownV3 } from "../risk";
import type { JudgeProfileLite } from "../judges";

const oneDay = 86400000;
const now = new Date("2026-05-08T00:00:00Z");

describe("computeRisk (v1)", () => {
  it("returns zero for empty cases", () => {
    const r = computeRisk([], now);
    expect(r.score).toBe(0);
    expect(r.band).toBe("low");
  });

  it("scales with volume + recency + severity", () => {
    const cases: CaseLite[] = Array.from({ length: 10 }, (_, i) => ({
      dateFiled: new Date(now.getTime() - i * 30 * oneDay),
      natureOfSuit: "850",
    }));
    const r = computeRisk(cases, now);
    // 10 securities cases all within 12mo → recency 1.0, severity 0.95,
    // volume ~0.61, total score ~85 → "high" band.
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.band).toBe("high");
  });
});

describe("computeRiskV2", () => {
  it("equals v1 when momentum/concentration/jurisdiction are all neutral", () => {
    const cases: CaseLiteV2[] = [
      { dateFiled: new Date(now.getTime() - 400 * oneDay), natureOfSuit: "110", court: null },
    ];
    const v1 = computeRisk(cases.map((c) => ({ dateFiled: c.dateFiled, natureOfSuit: c.natureOfSuit })), now);
    const v2 = computeRiskV2(cases, null, now);
    expect(v2.score).toBe(v1.score);
    expect(v2.scoreVersion).toBe("v2");
  });

  it("momentum boost fires on recent spike", () => {
    const cases: CaseLiteV2[] = [
      ...Array.from({ length: 12 }, (_, i) => ({
        dateFiled: new Date(now.getTime() - (30 + i * 30) * oneDay),
        natureOfSuit: "110",
        court: null as string | null,
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        dateFiled: new Date(now.getTime() - i * 4 * oneDay),
        natureOfSuit: "110",
        court: null as string | null,
      })),
    ];
    const v2 = computeRiskV2(cases, null, now);
    const v1 = computeRisk(cases.map((c) => ({ dateFiled: c.dateFiled, natureOfSuit: c.natureOfSuit })), now);
    expect(v2.momentumFactor).toBeGreaterThan(0);
    expect(v2.score).toBeGreaterThanOrEqual(v1.score);
  });

  it("concentration bonus fires when all cases in one category", () => {
    const cases: CaseLiteV2[] = Array.from({ length: 10 }, (_, i) => ({
      dateFiled: new Date(now.getTime() - i * 20 * oneDay),
      natureOfSuit: "850",
      court: null,
    }));
    const v2 = computeRiskV2(cases, null, now);
    expect(v2.concentrationFactor).toBeGreaterThan(0.5);
  });

  it("concentration bonus is zero for diffuse cases", () => {
    const codes = ["110", "210", "440", "830", "850"];
    const cases: CaseLiteV2[] = Array.from({ length: 10 }, (_, i) => ({
      dateFiled: new Date(now.getTime() - i * 20 * oneDay),
      natureOfSuit: codes[i % codes.length],
      court: null,
    }));
    const v2 = computeRiskV2(cases, null, now);
    expect(v2.concentrationFactor).toBeLessThan(0.3);
  });

  it("jurisdiction multiplier applies federal weight", () => {
    const cases: CaseLiteV2[] = Array.from({ length: 5 }, (_, i) => ({
      dateFiled: new Date(now.getTime() - i * 30 * oneDay),
      natureOfSuit: "110",
      court: "ca9",
    }));
    const v2 = computeRiskV2(cases, null, now);
    expect(v2.jurisdictionFactor).toBeCloseTo(1.15, 2);
  });

  it("score is clamped to [0, 100]", () => {
    const cases: CaseLiteV2[] = Array.from({ length: 200 }, (_, i) => ({
      dateFiled: new Date(now.getTime() - i * oneDay),
      natureOfSuit: "850",
      court: "ca9",
    }));
    const v2 = computeRiskV2(cases, null, now);
    expect(v2.score).toBeLessThanOrEqual(100);
    expect(v2.score).toBeGreaterThanOrEqual(0);
  });

  it("future-dated cases are skipped (do not inflate recent30 / recent12mo)", () => {
    const cases: CaseLiteV2[] = [
      { dateFiled: new Date(now.getTime() + 10 * oneDay), natureOfSuit: "110", court: null },
      { dateFiled: new Date(now.getTime() + 100 * oneDay), natureOfSuit: "110", court: null },
    ];
    const v2 = computeRiskV2(cases, null, now);
    expect(v2.recent30).toBe(0);
    // baseline floored to 0.5 since recent12mo = 0
    expect(v2.baselineMonthly).toBe(0.5);
    expect(v2.momentumFactor).toBe(0.5); // neutral (boost 0 → factor 0.5)
  });

  it("topCircuit aggregates by circuit, not raw court id", () => {
    // Three districts all in 9th Circuit (cand, cacd, casd).
    const cases: CaseLiteV2[] = [
      { dateFiled: new Date(now.getTime() - 10 * oneDay), natureOfSuit: "110", court: "cand" },
      { dateFiled: new Date(now.getTime() - 20 * oneDay), natureOfSuit: "110", court: "cacd" },
      { dateFiled: new Date(now.getTime() - 30 * oneDay), natureOfSuit: "110", court: "casd" },
    ];
    const v2 = computeRiskV2(cases, null, now);
    expect(v2.topCircuit).toBe("ca9");
    expect(v2.topCircuitShare).toBe(1.0);
  });

  it("momentum boost cap is symmetric [-10, +10]; factor in [0, 1]", () => {
    // Massive recent30 with tiny baseline → tanh saturates at +1 → boost +10
    const cases: CaseLiteV2[] = Array.from({ length: 50 }, (_, i) => ({
      dateFiled: new Date(now.getTime() - i * (oneDay / 2)), // 25 in last 30 days
      natureOfSuit: "110",
      court: null,
    }));
    const v2 = computeRiskV2(cases, null, now);
    expect(v2.momentumFactor).toBeGreaterThan(0.9);
    expect(v2.momentumFactor).toBeLessThanOrEqual(1.0);
  });

  it("concentrationFactor is 0 for single-case companies (avoids 100% concentration on 1 case)", () => {
    const cases: CaseLiteV2[] = [
      { dateFiled: new Date(now.getTime() - 30 * oneDay), natureOfSuit: "850", court: null },
    ];
    const v2 = computeRiskV2(cases, null, now);
    expect(v2.concentrationFactor).toBe(0);
  });
});

describe("computeRiskV3", () => {
  it("equals v2 score when no judge profiles available (judgeFactor = 1.0)", () => {
    const cases: CaseLiteV3[] = Array.from({ length: 5 }, (_, i) => ({
      dateFiled: new Date(now.getTime() - i * 30 * oneDay),
      natureOfSuit: "110",
      court: "ca9",
      judgeId: `judge_${i}`,
    }));
    const v2 = computeRiskV2(cases, null, now);
    const v3 = computeRiskV3(cases, new Map(), now);
    expect(v3.score).toBe(v2.score);
    expect(v3.judgeFactor).toBe(1.0);
    expect(v3.scoreVersion).toBe("v3");
  });

  it("low-dismissal judges nudge score up (judgeFactor > 1)", () => {
    const cases: CaseLiteV3[] = Array.from({ length: 5 }, (_, i) => ({
      dateFiled: new Date(now.getTime() - i * 30 * oneDay),
      natureOfSuit: "110",
      court: null,
      judgeId: "j_low",
    }));
    const profiles = new Map<string, JudgeProfileLite>([
      ["j_low", { dismissalRate: 0.10, caseCount: 50 }],
    ]);
    const v2 = computeRiskV2(cases, null, now);
    const v3 = computeRiskV3(cases, profiles, now);
    expect(v3.judgeFactor).toBeCloseTo(1.10, 2);
    expect(v3.score).toBeGreaterThanOrEqual(v2.score);
  });

  it("high-dismissal judges nudge score down (judgeFactor < 1)", () => {
    const cases: CaseLiteV3[] = Array.from({ length: 5 }, (_, i) => ({
      dateFiled: new Date(now.getTime() - i * 30 * oneDay),
      natureOfSuit: "110",
      court: null,
      judgeId: "j_high",
    }));
    const profiles = new Map<string, JudgeProfileLite>([
      ["j_high", { dismissalRate: 0.60, caseCount: 50 }],
    ]);
    const v3 = computeRiskV3(cases, profiles, now);
    expect(v3.judgeFactor).toBeCloseTo(0.92, 2);
  });

  it("meanJudgeDismissal computed only over case-judge pairs with valid profiles", () => {
    const cases: CaseLiteV3[] = [
      { dateFiled: new Date(now.getTime() - 10 * oneDay), natureOfSuit: "110", court: null, judgeId: "j1" },
      { dateFiled: new Date(now.getTime() - 20 * oneDay), natureOfSuit: "110", court: null, judgeId: "j2" },
      { dateFiled: new Date(now.getTime() - 30 * oneDay), natureOfSuit: "110", court: null, judgeId: null },
    ];
    const profiles = new Map<string, JudgeProfileLite>([
      ["j1", { dismissalRate: 0.20, caseCount: 50 }],
      ["j2", { dismissalRate: 0.30, caseCount: 50 }],
    ]);
    const v3 = computeRiskV3(cases, profiles, now);
    expect(v3.meanJudgeDismissal).toBeCloseTo(0.25, 3);
    expect(v3.judgeSampleSize).toBe(2);
  });
});

describe("deriveSubScores (v3.1)", () => {
  function mkV3(over: Partial<RiskBreakdownV3> = {}): RiskBreakdownV3 {
    return {
      score: 50,
      band: "moderate",
      volumeFactor: 0.5,
      recencyFactor: 0.5,
      severityFactor: 0.5,
      momentumFactor: 0.5,        // neutral
      concentrationFactor: 0,
      jurisdictionFactor: 1.0,
      judgeFactor: 1.0,
      firmSignalFactor: 0,
      similaritySignalFactor: 0,
      scoreVersion: "v3",
      caseCount: 10,
      recentCases: 5,
      recent30: 0,
      baselineMonthly: 1,
      topCategory: null,
      topCategoryShare: 0,
      topCircuit: null,
      topCircuitShare: 0,
      meanJudgeDismissal: null,
      judgeSampleSize: 0,
      ...over,
    };
  }

  it("structural ignores momentum + concentration boosts", () => {
    const calm = deriveSubScores(mkV3({ momentumFactor: 0.5, concentrationFactor: 0 }));
    const spiking = deriveSubScores(mkV3({ momentumFactor: 1.0, concentrationFactor: 1.0 }));
    expect(calm.structural).toBe(spiking.structural);
  });

  it("momentum picks up the spike + concentration", () => {
    const calm = deriveSubScores(mkV3({ momentumFactor: 0.5, concentrationFactor: 0 }));
    const spiking = deriveSubScores(mkV3({ momentumFactor: 1.0, concentrationFactor: 1.0 }));
    expect(spiking.momentum).toBeGreaterThan(calm.momentum);
    expect(spiking.momentum).toBe(100);
  });

  it("structural responds to volume/recency/severity", () => {
    const empty = deriveSubScores(mkV3({ volumeFactor: 0, recencyFactor: 0, severityFactor: 0 }));
    const heavy = deriveSubScores(mkV3({ volumeFactor: 1, recencyFactor: 1, severityFactor: 1 }));
    expect(empty.structural).toBe(0);
    expect(heavy.structural).toBe(100);
  });

  it("multiplies through jurisdiction + judge factors", () => {
    const base = deriveSubScores(mkV3({ jurisdictionFactor: 1.0, judgeFactor: 1.0 }));
    const boosted = deriveSubScores(mkV3({ jurisdictionFactor: 1.15, judgeFactor: 1.10 }));
    expect(boosted.structural).toBeGreaterThan(base.structural);
    expect(boosted.momentum).toBeGreaterThan(base.momentum);
  });

  it("clamps at 0 and 100", () => {
    const max = deriveSubScores(
      mkV3({ volumeFactor: 1, recencyFactor: 1, severityFactor: 1, jurisdictionFactor: 1.15, judgeFactor: 1.15 }),
    );
    expect(max.structural).toBe(100);
    const min = deriveSubScores(
      mkV3({ volumeFactor: 0, recencyFactor: 0, severityFactor: 0, momentumFactor: 0 }),
    );
    expect(min.structural).toBe(0);
    expect(min.momentum).toBe(0);
  });

  it("neutral momentum with no concentration yields 50", () => {
    const r = deriveSubScores(mkV3({ momentumFactor: 0.5, concentrationFactor: 0 }));
    expect(r.momentum).toBe(50);
  });
});
