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
import { courtCircuit, courtWeight } from "./jurisdiction";
import { aggregateJudgeMultiplier, type JudgeProfileLite } from "./judges";

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
    if (age < 0) continue;                  // skip future-dated (data error)
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
export type CaseLiteV3 = CaseLiteV2 & { judgeId: string | null };

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

export type RiskBreakdownV3 = Omit<RiskBreakdownV2, "scoreVersion"> & {
  judgeFactor: number;
  // v3.1/v3.2 seam — always 0 in v3.0.
  firmSignalFactor: number;
  similaritySignalFactor: number;
  scoreVersion: "v3";
  // 12mo case-judge mean dismissal rate (for judge_skew driver). Null when
  // sample insufficient.
  meanJudgeDismissal: number | null;
  judgeSampleSize: number;
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
    if (age < 0) continue;                  // skip future-dated (data error)
    if (age <= 30 * ONE_DAY) recent30++;
    if (age <= 365 * ONE_DAY) recent12mo++;
  }
  const baselineMonthly = Math.max(0.5, recent12mo / 12);
  const momentum = recent30 / baselineMonthly;
  // Dormant companies (no activity in trailing 12 months) get neutral momentum,
  // not negative — preserves the v1↔v2 monotonicity guarantee for dormant cos.
  // Boost range is symmetric [-10, +10] from 10·tanh(...); methodology doc
  // documents this honest range (the earlier "+20" cap was unreachable).
  const momentumBoostRaw = recent12mo === 0 ? 0 : 10 * Math.tanh(momentum - 1);
  const momentumBoost = Math.max(-10, Math.min(10, momentumBoostRaw));
  // Stored as 0..1 (boost -10 → 0, boost 0 → 0.5, boost +10 → 1).
  const momentumFactor = Math.max(0, Math.min(1, (momentumBoost + 10) / 20));

  // --- concentration: HHI over 12mo cases by category ---
  const cat12mo: Partial<Record<NosCategory, number>> = {};
  let cat12moTotal = 0;
  for (const c of cases) {
    if (!c.dateFiled) continue;
    const age = now.getTime() - c.dateFiled.getTime();
    if (age < 0 || age > 365 * ONE_DAY) continue;
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
  //   N == 1, cases < 3 → trivial concentration; factor and bonus both 0.
  //   N == 1, cases >= 3 → fully concentrated; factor 1, bonus 10.
  //   N >= 2 → normalized HHI deviation from even distribution.
  const HHIFloor = N > 0 ? 1 / N : 1;
  let concentrationFactor: number;
  let concentrationBonus: number;
  if (N === 0 || (N === 1 && cat12moTotal < 3)) {
    concentrationFactor = 0;
    concentrationBonus = 0;
  } else if (N === 1) {
    concentrationFactor = 1;
    concentrationBonus = 10;
  } else {
    const norm = (HHI - HHIFloor) / (1 - HHIFloor);
    concentrationFactor = Math.max(0, Math.min(1, norm));
    concentrationBonus = Math.max(0, Math.min(10, 10 * norm));
  }

  // --- jurisdiction: weighted average over 12mo cases ---
  // topCircuit aggregates by *circuit* (e.g. ca9), not by raw district id —
  // so all 9th Circuit districts collapse into "ca9" for the driver signal.
  let jurNum = 0;
  let jurDen = 0;
  const circuitCount: Record<string, number> = {};
  let circuitTotal = 0;
  for (const c of cases) {
    if (!c.dateFiled) continue;
    const age = now.getTime() - c.dateFiled.getTime();
    if (age < 0 || age > 365 * ONE_DAY) continue;
    const w = courtWeight(c.court);
    jurNum += w;
    jurDen += 1;
    const circuitKey = courtCircuit(c.court) ?? c.court?.toLowerCase() ?? null;
    if (circuitKey) {
      circuitCount[circuitKey] = (circuitCount[circuitKey] ?? 0) + 1;
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

// --- v3 ---
//
// v3_score = clamp(0, 100, structural + momentum + concentration)
//          * jurisdictionFactor * judgeFactor
// Monotonicity: judgeFactor=1.0 (no profiles) → v3_score == v2_score.

export function computeRiskV3(
  cases: CaseLiteV3[],
  judgeProfiles: Map<string, JudgeProfileLite>,
  now: Date = new Date(),
): RiskBreakdownV3 {
  const v2 = computeRiskV2(cases, null, now);

  // judge_multiplier over trailing-12mo cases
  const trailing12mo = cases.filter((c) => {
    if (!c.dateFiled) return false;
    const age = now.getTime() - c.dateFiled.getTime();
    return age >= 0 && age <= 365 * ONE_DAY;
  });
  const judgeFactor = aggregateJudgeMultiplier(
    trailing12mo.map((c) => ({ judgeId: c.judgeId })),
    judgeProfiles,
  );

  // judge_skew metadata — mean dismissal rate over judges with valid profiles
  let dismissalSum = 0;
  let dismissalN = 0;
  for (const c of trailing12mo) {
    if (!c.judgeId) continue;
    const p = judgeProfiles.get(c.judgeId);
    if (!p || p.dismissalRate == null || p.caseCount < 5) continue;
    dismissalSum += p.dismissalRate;
    dismissalN += 1;
  }
  const meanJudgeDismissal = dismissalN > 0 ? dismissalSum / dismissalN : null;

  // composition: scale v2.score (already includes jurisdiction multiplier)
  // by judgeFactor. Avoids re-rounding artifacts from re-deriving boosts
  // out of the normalized factor fields. Monotonicity preserved: when
  // judgeFactor=1.0, v3.score == v2.score exactly.
  const score = Math.max(
    0,
    Math.min(100, Math.round(v2.score * judgeFactor)),
  );

  return {
    score,
    band: bandFor(score),
    volumeFactor: v2.volumeFactor,
    recencyFactor: v2.recencyFactor,
    severityFactor: v2.severityFactor,
    momentumFactor: v2.momentumFactor,
    concentrationFactor: v2.concentrationFactor,
    jurisdictionFactor: v2.jurisdictionFactor,
    judgeFactor,
    firmSignalFactor: 0,
    similaritySignalFactor: 0,
    scoreVersion: "v3",
    caseCount: v2.caseCount,
    recentCases: v2.recentCases,
    recent30: v2.recent30,
    baselineMonthly: v2.baselineMonthly,
    topCategory: v2.topCategory,
    topCategoryShare: v2.topCategoryShare,
    topCircuit: v2.topCircuit,
    topCircuitShare: v2.topCircuitShare,
    meanJudgeDismissal,
    judgeSampleSize: dismissalN,
  };
}
