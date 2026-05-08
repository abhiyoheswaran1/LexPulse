// Statistics functions for the calibration backtest. Pure, testable,
// no I/O. The harness in scripts/backtest.ts walks the data; this
// module computes the numbers reported in the methodology doc.

export type BacktestObs = {
  scoreAtAnchor: number;
  band: string;
  hadEvent30: boolean;
  hadEvent90: boolean;
  hadEvent180: boolean;
};

export type Window = 30 | 90 | 180;

function eventFor(o: BacktestObs, w: Window): boolean {
  return w === 30 ? o.hadEvent30 : w === 90 ? o.hadEvent90 : o.hadEvent180;
}

export type HitRateBand = {
  n: number;
  hits: number;
  rate: number;
  lift: number;
};

export type HitRateReport = {
  baseRate: number;
  byBand: Record<string, HitRateBand>;
};

export function hitRateByBand(obs: BacktestObs[], w: Window): HitRateReport {
  const buckets = new Map<string, { yes: number; total: number }>();
  let hitsTotal = 0;
  for (const o of obs) {
    const had = eventFor(o, w);
    const cur = buckets.get(o.band) ?? { yes: 0, total: 0 };
    cur.total++;
    if (had) {
      cur.yes++;
      hitsTotal++;
    }
    buckets.set(o.band, cur);
  }
  const total = obs.length;
  const baseRate = total > 0 ? hitsTotal / total : 0;
  const byBand: Record<string, HitRateBand> = {};
  for (const [band, { yes, total: n }] of buckets) {
    const rate = n > 0 ? yes / n : 0;
    byBand[band] = {
      n,
      hits: yes,
      rate,
      lift: baseRate > 0 ? rate / baseRate : 0,
    };
  }
  return { baseRate, byBand };
}

// Spearman rank correlation. Tie-aware via average ranks. Returns 0 for
// degenerate inputs (n < 3, all-same x, all-same y).
export function spearman(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 3) return 0;
  const rank = (arr: number[]): number[] => {
    const idx = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array<number>(arr.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[idx[k].i] = avg;
      i = j + 1;
    }
    return ranks;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const n = xs.length;
  const meanR = (n + 1) / 2;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - meanR;
    const b = ry[i] - meanR;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

export type DecileBucket = {
  decile: number;
  n: number;
  rate: number;
  lift: number;
};

// Decile lift curve. Sort by score, slice into 10 equal buckets, report
// event rate and lift per bucket. Decile 1 = lowest scores, 10 = highest.
export function decileLift(obs: BacktestObs[], w: Window): DecileBucket[] {
  const sorted = [...obs].sort((a, b) => a.scoreAtAnchor - b.scoreAtAnchor);
  const n = sorted.length;
  if (n === 0) return [];
  const baseRate = sorted.filter((o) => eventFor(o, w)).length / n;
  const out: DecileBucket[] = [];
  for (let d = 1; d <= 10; d++) {
    const start = Math.floor(((d - 1) * n) / 10);
    const end = Math.floor((d * n) / 10);
    const slice = sorted.slice(start, end);
    if (slice.length === 0) continue;
    const yes = slice.filter((o) => eventFor(o, w)).length;
    const rate = yes / slice.length;
    out.push({
      decile: d,
      n: slice.length,
      rate,
      lift: baseRate > 0 ? rate / baseRate : 0,
    });
  }
  return out;
}

export function meanStd(a: number[]): { mean: number; std: number; n: number } {
  const n = a.length;
  if (n === 0) return { mean: 0, std: 0, n: 0 };
  const m = a.reduce((s, v) => s + v, 0) / n;
  const v = a.reduce((s, x) => s + (x - m) ** 2, 0) / n;
  return { mean: m, std: Math.sqrt(v), n };
}
