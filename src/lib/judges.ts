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

// Case-weighted mean over case-judge pairs that resolve to a *valid*
// profile (caseCount >= MIN_SAMPLE, dismissalRate non-null). Cases with
// no judgeId or no usable profile are excluded from the average — NOT
// counted as 1.0.
//
// Why exclude vs. count-as-neutral:
//   At the current production density (~4% case-judge coverage), counting
//   no-profile cases as 1.0 dilutes the signal toward neutral. A company
//   with 100 cases and 3 low-dismissal judges (mult 1.10) would average
//   to 1.003 — 0.3% effect — even though those 3 judges are saying real
//   things about realized risk. Excluding lets the few covered cases
//   speak. Methodology trade-off documented in the v3 doc.
//
// Returns 1.0 when no cases resolve (caller treats as neutral; the
// `judgeSampleSize` field on the breakdown surfaces the actual coverage
// so callers can downweight if they want).
export function aggregateJudgeMultiplier(
  cases: Array<{ judgeId: string | null }>,
  profiles: Map<string, JudgeProfileLite>,
): number {
  let sum = 0;
  let n = 0;
  for (const c of cases) {
    if (!c.judgeId) continue;
    const profile = profiles.get(c.judgeId);
    if (!profile) continue;
    if (profile.caseCount < MIN_SAMPLE) continue;
    if (profile.dismissalRate == null) continue;
    sum += judgeMultiplier(profile);
    n++;
  }
  return n === 0 ? 1.0 : sum / n;
}
