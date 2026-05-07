import { describe, it, expect } from "vitest";
import { computeRisk, computeRiskV2, type CaseLite, type CaseLiteV2 } from "../risk";

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
