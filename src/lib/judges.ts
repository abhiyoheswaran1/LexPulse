// Judge behavior weighting (Score v3).
//
// Judges with high dismissal rates → cases tend to terminate quickly →
// realized risk is lower → multiplier < 1.0.
// Judges with low dismissal rates → cases advance → realized risk higher →
// multiplier > 1.0.
//
// We refuse to estimate from small samples: profiles with caseCount < 5
// or null dismissalRate map to a neutral 1.0 multiplier.

export type JudgeProfileLite = {
  dismissalRate: number | null;
  caseCount: number;
};

const MIN_SAMPLE = 5;
const MULT_MIN = 0.92;
const MULT_MAX = 1.10;

// Linear map from dismissalRate ∈ [0.10, 0.60] to multiplier ∈ [1.10, 0.92].
// Outside that range, clamp to the endpoints.
//   rate 0.10 (low dismissal) → 1.10
//   rate 0.35 (median)        → 1.01
//   rate 0.60 (high dismissal) → 0.92
export function judgeMultiplier(profile: JudgeProfileLite | null): number {
  if (!profile) return 1.0;
  if (profile.caseCount < MIN_SAMPLE) return 1.0;
  if (profile.dismissalRate == null) return 1.0;
  const rate = Math.max(0, Math.min(1, profile.dismissalRate));
  // line through (0.10, 1.10) and (0.60, 0.92): slope = (0.92-1.10)/(0.60-0.10) = -0.36
  const raw = 1.10 + (rate - 0.10) * -0.36;
  return Math.max(MULT_MIN, Math.min(MULT_MAX, raw));
}

// Case-weighted mean over all (case, judge) pairs in the input. Cases with
// no judge or no profile contribute 1.0 (neutral). Returns 1.0 when input
// is empty.
export function aggregateJudgeMultiplier(
  cases: Array<{ judgeId: string | null }>,
  profiles: Map<string, JudgeProfileLite>,
): number {
  if (cases.length === 0) return 1.0;
  let sum = 0;
  for (const c of cases) {
    const profile = c.judgeId ? profiles.get(c.judgeId) ?? null : null;
    sum += judgeMultiplier(profile);
  }
  return sum / cases.length;
}
