// Risk scoring.
//
// v1 (legacy, retained for replay): score = 35*volume + 35*recency + 30*severity.
// v2 (current):
//   v2_score = clamp(0, 100,
//                  structural_score + momentum_boost + concentration_bonus
//              ) * jurisdiction_multiplier
// where structural_score is the v1 calculation. Monotonicity guarantee:
// when momentum=0, concentration=0, multiplier=1, v2_score == v1_score.

import { categorize, severityForNos, type NosCategory } from "./case-types";
import { courtWeight } from "./jurisdiction";

// --- v1 (preserved, unchanged behavior) ---

export type RiskBand = "low" | "moderate" | "elevated" | "high";

export function bandFor(score: number): RiskBand {
  if (score >= 75) return "high";
  if (score >= 50) return "elevated";
  if (score >= 25) return "moderate";
  return "low";
}

export type CaseLite = {
  dateFiled: Date | null;
  natureOfSuit: string | null;
};

export type RiskBreakdown = {
  score: number;
  band: RiskBand;
  volumeFactor: number;
  recencyFactor: number;
  severityFactor: number;
  caseCount: number;
  recentCases: number;
};

export function computeRisk(cases: CaseLite[], now: Date = new Date()): RiskBreakdown {
  const total = cases.length;
  if (total === 0) {
    return {
      score: 0,
      band: "low",
      volumeFactor: 0,
      recencyFactor: 0,
      severityFactor: 0,
      caseCount: 0,
      recentCases: 0,
    };
  }
  const volumeFactor = Math.min(1, Math.log10(1 + total) / Math.log10(1 + 50));
  const yearMs = 365 * 24 * 60 * 60 * 1000;
  let recent12 = 0;
  let recent24 = 0;
  for (const c of cases) {
    if (!c.dateFiled) continue;
    const age = now.getTime() - c.dateFiled.getTime();
    if (age <= yearMs) recent12++;
    else if (age <= 2 * yearMs) recent24++;
  }
  const recencyFactor = Math.min(1, (recent12 + 0.5 * recent24) / total);
  const severityFactor = cases.reduce((acc, c) => acc + severityForNos(c.natureOfSuit), 0) / total;
  const score = Math.max(
    0,
    Math.min(100, Math.round(100 * (0.35 * volumeFactor + 0.35 * recencyFactor + 0.3 * severityFactor))),
  );
  return {
    score,
    band: bandFor(score),
    volumeFactor,
    recencyFactor,
    severityFactor,
    caseCount: total,
    recentCases: recent12,
  };
}

// --- v2 ---

export type CaseLiteV2 = CaseLite & { court: string | null };

export type RiskBreakdownV2 = RiskBreakdown & {
  momentumFactor: number;
  concentrationFactor: number;
  jurisdictionFactor: number;
  scoreVersion: "v2";
  // raw stats useful for drivers + benchmarks (not persisted directly):
  recent30: number;
  baselineMonthly: number;
  topCategory: NosCategory | null;
  topCategoryShare: number;
  topCircuit: string | null;
  topCircuitShare: number;
};

const ONE_DAY = 86400000;

export function computeRiskV2(
  cases: CaseLiteV2[],
  _prev: RiskBreakdownV2 | null,
  now: Date = new Date(),
): RiskBreakdownV2 {
  const v1 = computeRisk(
    cases.map((c) => ({ dateFiled: c.dateFiled, natureOfSuit: c.natureOfSuit })),
    now,
  );

  // --- momentum ---
  let recent30 = 0;
  let recent12mo = 0;
  for (const c of cases) {
    if (!c.dateFiled) continue;
    const age = now.getTime() - c.dateFiled.getTime();
    if (age <= 30 * ONE_DAY) recent30++;
    if (age <= 365 * ONE_DAY) recent12mo++;
  }
  const baselineMonthly = Math.max(0.5, recent12mo / 12);
  const momentum = recent30 / baselineMonthly;
  // Dormant companies (no activity in trailing 12 months) get neutral momentum,
  // not negative — preserves the v1↔v2 monotonicity guarantee for dormant cos.
  const momentumBoostRaw = recent12mo === 0 ? 0 : 10 * Math.tanh(momentum - 1);
  const momentumBoost = Math.max(-10, Math.min(20, momentumBoostRaw));
  // Store normalized 0..1 for UI/persistence; -10..+20 → 0..1
  const momentumFactor = Math.max(0, Math.min(1, (momentumBoost + 10) / 30));

  // --- concentration: HHI over 12mo cases by category ---
  const cat12mo: Partial<Record<NosCategory, number>> = {};
  let cat12moTotal = 0;
  for (const c of cases) {
    if (!c.dateFiled) continue;
    if (now.getTime() - c.dateFiled.getTime() > 365 * ONE_DAY) continue;
    const k = categorize(c.natureOfSuit);
    cat12mo[k] = (cat12mo[k] ?? 0) + 1;
    cat12moTotal++;
  }
  const cats = Object.entries(cat12mo).filter(([, n]) => (n ?? 0) > 0) as Array<[NosCategory, number]>;
  const N = cats.length;
  let topCategory: NosCategory | null = null;
  let topCategoryShare = 0;
  let HHI = 0;
  if (cat12moTotal > 0 && N > 0) {
    for (const [k, n] of cats) {
      const p = n / cat12moTotal;
      HHI += p * p;
      if (p > topCategoryShare) {
        topCategoryShare = p;
        topCategory = k;
      }
    }
  }
  // Concentration math:
  //   N == 0 → no 12mo activity, factor and bonus are 0.
  //   N == 1 → fully concentrated by definition (one category). Bonus only
  //            fires if there's enough activity (>= 3 cases) to be meaningful.
  //   N >= 2 → normalized HHI deviation from even distribution.
  const HHIFloor = N > 0 ? 1 / N : 1;
  let concentrationFactor: number;
  let concentrationBonus: number;
  if (N === 0) {
    concentrationFactor = 0;
    concentrationBonus = 0;
  } else if (N === 1) {
    concentrationFactor = 1;
    concentrationBonus = cat12moTotal >= 3 ? 10 : 0;
  } else {
    const norm = (HHI - HHIFloor) / (1 - HHIFloor);
    concentrationFactor = Math.max(0, Math.min(1, norm));
    concentrationBonus = Math.max(0, Math.min(10, 10 * norm));
  }

  // --- jurisdiction: weighted average over 12mo cases ---
  let jurNum = 0;
  let jurDen = 0;
  const circuitCount: Record<string, number> = {};
  let circuitTotal = 0;
  for (const c of cases) {
    if (!c.dateFiled) continue;
    if (now.getTime() - c.dateFiled.getTime() > 365 * ONE_DAY) continue;
    const w = courtWeight(c.court);
    jurNum += w;
    jurDen += 1;
    if (c.court) {
      circuitCount[c.court] = (circuitCount[c.court] ?? 0) + 1;
      circuitTotal++;
    }
  }
  const jurisdictionFactor = jurDen > 0 ? jurNum / jurDen : 1.0;

  let topCircuit: string | null = null;
  let topCircuitShare = 0;
  for (const [k, n] of Object.entries(circuitCount)) {
    const p = circuitTotal > 0 ? n / circuitTotal : 0;
    if (p > topCircuitShare) {
      topCircuitShare = p;
      topCircuit = k;
    }
  }

  // --- composition ---
  const adjusted = v1.score + momentumBoost + concentrationBonus;
  const clampedAdjusted = Math.max(0, Math.min(100, adjusted));
  const score = Math.max(0, Math.min(100, Math.round(clampedAdjusted * jurisdictionFactor)));

  return {
    score,
    band: bandFor(score),
    volumeFactor: v1.volumeFactor,
    recencyFactor: v1.recencyFactor,
    severityFactor: v1.severityFactor,
    momentumFactor,
    concentrationFactor,
    jurisdictionFactor,
    scoreVersion: "v2",
    caseCount: v1.caseCount,
    recentCases: v1.recentCases,
    recent30,
    baselineMonthly,
    topCategory,
    topCategoryShare,
    topCircuit,
    topCircuitShare,
  };
}
