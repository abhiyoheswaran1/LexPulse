import { describe, it, expect } from "vitest";
import { computeBenchmark, winsorize } from "../benchmarks";

describe("benchmarks", () => {
  it("returns null when cohort < 29 peers (= sector with < 30 companies)", () => {
    const result = computeBenchmark(50, [10, 20, 30]);
    expect(result.cohortSize).toBe(3);
    expect(result.percentile).toBeNull();
    expect(result.cohortMean).toBeNull();
    expect(result.cohortP50).toBeNull();
    expect(result.zScore).toBeNull();
    expect(result.reason).toBe("cohort_too_small");
  });

  it("computes percentile when peer cohort >= 29 (sector >= 30 companies)", () => {
    const cohort = Array.from({ length: 29 }, (_, i) => i + 1); // 1..29 peers
    const result = computeBenchmark(15, cohort);
    expect(result.cohortSize).toBe(29);
    expect(result.percentile!).toBeGreaterThan(40);
    expect(result.percentile!).toBeLessThan(60);
  });

  it("tie-aware percentile splits ties between rank groups", () => {
    // 10 peers all at 50. We tie with all of them. Tie-aware percentile
    // treats us as mid-rank: less=0, tied=10 → (0 + 0.5*10)/cohortSize.
    // (Need cohort ≥ 29 to clear the gate; pad with low scores.)
    const cohort = [...Array(10).fill(50), ...Array(20).fill(0)]; // 30 peers
    const result = computeBenchmark(50, cohort);
    // 0 strictly less than 50? No, 20 are < 50. tied = 10.
    // percentile = (20 + 0.5*10) / 30 = 25/30 = 83.3
    expect(result.percentile!).toBeCloseTo(83.3, 1);
  });

  it("z-score is positive above mean, negative below", () => {
    const cohort = Array.from({ length: 50 }, (_, i) => i);
    const above = computeBenchmark(40, cohort);
    const below = computeBenchmark(10, cohort);
    expect(above.zScore!).toBeGreaterThan(0);
    expect(below.zScore!).toBeLessThan(0);
  });

  it("z-score floor prevents division by zero in degenerate cohort", () => {
    const cohort = Array.from({ length: 30 }, () => 50);
    const result = computeBenchmark(50, cohort);
    expect(result.zScore).toBe(0);
  });

  it("winsorizes p99 outliers", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10000];
    const w = winsorize(data, 0.99);
    expect(w[w.length - 1]).toBeLessThan(10000);
  });

  it("percentile is 0..100", () => {
    const cohort = Array.from({ length: 100 }, (_, i) => i);
    expect(computeBenchmark(0, cohort).percentile!).toBeGreaterThanOrEqual(0);
    expect(computeBenchmark(99, cohort).percentile!).toBeLessThanOrEqual(100);
  });
});
