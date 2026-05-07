// Sector-cohort benchmarking.
//
// Two-pass orchestration: caller computes all v2 scores in pass 1, accumulates
// { sectorKey: scores[] }, then in pass 2 calls computeBenchmark per company.
//
// Cohort gate: minimum 30 peers; below that, return null with a reason.

export type Benchmark = {
  cohortSize: number;
  percentile: number | null;
  cohortMean: number | null;
  cohortP50: number | null;
  zScore: number | null;
  reason?: "cohort_too_small";
};

export function winsorize(values: number[], pct = 0.99): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const cap = sorted[Math.floor((sorted.length - 1) * pct)];
  return values.map((v) => (v > cap ? cap : v));
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const m = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: number[], mu: number): number {
  if (values.length < 2) return 0;
  const sumSq = values.reduce((a, v) => a + (v - mu) * (v - mu), 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

export function computeBenchmark(score: number, cohortScores: number[]): Benchmark {
  const cohortSize = cohortScores.length;
  if (cohortSize < 30) {
    return {
      cohortSize,
      percentile: null,
      cohortMean: null,
      cohortP50: null,
      zScore: null,
      reason: "cohort_too_small",
    };
  }
  const w = winsorize(cohortScores, 0.99);
  const sorted = [...w].sort((a, b) => a - b);
  const mu = mean(w);
  const sd = Math.max(stdev(w, mu), 1);
  const zScore = (score - mu) / sd;
  const leq = sorted.filter((s) => s <= score).length;
  const percentile = (leq / cohortSize) * 100;
  return {
    cohortSize,
    percentile: Number(percentile.toFixed(1)),
    cohortMean: Number(mu.toFixed(2)),
    cohortP50: Math.round(median(sorted)),
    zScore: Number(zScore.toFixed(3)),
  };
}
