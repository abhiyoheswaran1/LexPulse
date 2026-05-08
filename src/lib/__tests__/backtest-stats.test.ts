import { describe, it, expect } from "vitest";
import {
  hitRateByBand,
  spearman,
  decileLift,
  meanStd,
  type BacktestObs,
} from "../backtest-stats";

function obs(score: number, band: string, had90: boolean, had30 = had90, had180 = had90): BacktestObs {
  return { scoreAtAnchor: score, band, hadEvent30: had30, hadEvent90: had90, hadEvent180: had180 };
}

describe("hitRateByBand", () => {
  it("returns base rate and per-band rates", () => {
    const data: BacktestObs[] = [
      obs(10, "low", false),
      obs(15, "low", false),
      obs(20, "low", true), // 1/3 in low
      obs(60, "elevated", true),
      obs(65, "elevated", true), // 2/2 in elevated
    ];
    const r = hitRateByBand(data, 90);
    expect(r.baseRate).toBeCloseTo(3 / 5);
    expect(r.byBand.low.rate).toBeCloseTo(1 / 3);
    expect(r.byBand.elevated.rate).toBe(1.0);
  });

  it("computes lift relative to baseline", () => {
    const data: BacktestObs[] = [
      obs(10, "low", false),
      obs(11, "low", false),
      obs(12, "low", false),
      obs(80, "high", true),
    ];
    const r = hitRateByBand(data, 90);
    expect(r.baseRate).toBeCloseTo(0.25);
    expect(r.byBand.high.lift).toBeCloseTo(4.0);
    expect(r.byBand.low.lift).toBe(0);
  });

  it("handles empty input", () => {
    const r = hitRateByBand([], 90);
    expect(r.baseRate).toBe(0);
    expect(Object.keys(r.byBand)).toHaveLength(0);
  });

  it("uses the requested window", () => {
    const data: BacktestObs[] = [
      { scoreAtAnchor: 10, band: "low", hadEvent30: true, hadEvent90: false, hadEvent180: false },
      { scoreAtAnchor: 80, band: "high", hadEvent30: false, hadEvent90: false, hadEvent180: true },
    ];
    expect(hitRateByBand(data, 30).baseRate).toBe(0.5);
    expect(hitRateByBand(data, 90).baseRate).toBe(0);
    expect(hitRateByBand(data, 180).baseRate).toBe(0.5);
  });
});

describe("spearman", () => {
  it("returns 1 for perfectly monotonic data", () => {
    expect(spearman([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])).toBeCloseTo(1.0);
  });

  it("returns -1 for perfectly anti-monotonic data", () => {
    expect(spearman([1, 2, 3, 4, 5], [50, 40, 30, 20, 10])).toBeCloseTo(-1.0);
  });

  it("returns 0 for uncorrelated data", () => {
    // Symmetric pattern: cancels out by construction
    const r = spearman([1, 2, 3, 4], [3, 1, 4, 2]);
    expect(Math.abs(r)).toBeLessThan(0.5);
  });

  it("returns 0 for arrays shorter than 3", () => {
    expect(spearman([1, 2], [3, 4])).toBe(0);
  });

  it("returns 0 for length mismatch", () => {
    expect(spearman([1, 2, 3], [1, 2])).toBe(0);
  });

  it("handles ties via average ranking", () => {
    // x = [1,2,2,3], y = [1,2,2,3] — should be 1.0 with tie-aware ranking
    expect(spearman([1, 2, 2, 3], [1, 2, 2, 3])).toBeCloseTo(1.0);
  });

  it("returns 0 when y is constant (degenerate)", () => {
    expect(spearman([1, 2, 3, 4], [5, 5, 5, 5])).toBe(0);
  });
});

describe("decileLift", () => {
  it("partitions sorted-by-score into 10 buckets and reports lift", () => {
    // 100 obs: even-score companies have a 50% event rate, odd-score 0%
    const data: BacktestObs[] = [];
    for (let i = 0; i < 100; i++) {
      data.push(obs(i, "x", i >= 90)); // only top 10 have events
    }
    const curve = decileLift(data, 90);
    expect(curve).toHaveLength(10);
    // Top decile (highest scores) should carry all events
    expect(curve[9].rate).toBe(1.0);
    expect(curve[0].rate).toBe(0.0);
    // Lift in top decile is 10x baseline (10/100 = 0.1)
    expect(curve[9].lift).toBeCloseTo(10.0);
  });

  it("returns empty for empty input", () => {
    expect(decileLift([], 90)).toEqual([]);
  });

  it("monotonic-by-construction: higher decile has higher lift when score predicts events", () => {
    const data: BacktestObs[] = [];
    for (let i = 0; i < 100; i++) {
      // event rate proportional to score
      data.push(obs(i, "x", Math.random() < i / 100));
    }
    const curve = decileLift(data, 90);
    // We don't require strict monotonicity (random noise), but decile 10
    // should beat decile 1 reliably.
    expect(curve[9].rate).toBeGreaterThan(curve[0].rate);
  });
});

describe("meanStd", () => {
  it("returns 0,0 for empty input", () => {
    expect(meanStd([])).toEqual({ mean: 0, std: 0, n: 0 });
  });

  it("returns the value with 0 std for a single-element array", () => {
    expect(meanStd([3.5])).toEqual({ mean: 3.5, std: 0, n: 1 });
  });

  it("computes population mean/std", () => {
    const r = meanStd([1, 2, 3, 4, 5]);
    expect(r.mean).toBe(3);
    expect(r.std).toBeCloseTo(Math.sqrt(2));
    expect(r.n).toBe(5);
  });
});
