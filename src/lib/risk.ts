// Risk scoring (v1 heuristic).
//
// Score ∈ [0, 100] = 35*volume + 35*recency + 30*severity, all factors in [0,1].
//
// volumeFactor: log-scaled count. 0 cases → 0. ~50 cases → ~1.
// recencyFactor: share of cases in trailing 12 months, with a soft floor for
//                trailing 24 months so a company with a single old case still
//                shows non-zero.
// severityFactor: weighted average of nature-of-suit weights.
//
// Weights are deliberately tunable constants in this file, not hidden in a
// model. The selling point of LexPulse v1 is *legible* risk, not black-box.

export const SEVERITY_WEIGHTS: Record<string, number> = {
  // High: investor / regulatory / antitrust
  securities: 0.95,
  antitrust: 0.9,
  rico: 0.9,
  "consumer fraud": 0.8,
  "false claims act": 0.85,
  // Mid-high: IP, employment class actions, products liability
  patent: 0.7,
  trademark: 0.55,
  copyright: 0.55,
  "products liability": 0.7,
  "employment - class": 0.7,
  // Mid: civil rights, environmental, ERISA
  "civil rights": 0.5,
  environmental: 0.6,
  erisa: 0.55,
  // Lower: contract, real property, tax, generic torts
  contract: 0.35,
  "real property": 0.25,
  tax: 0.3,
  tort: 0.4,
  // Default for unmapped or null
  other: 0.3,
};

export function severityFor(natureOfSuit?: string | null): number {
  if (!natureOfSuit) return SEVERITY_WEIGHTS.other;
  const k = natureOfSuit.toLowerCase();
  for (const [needle, w] of Object.entries(SEVERITY_WEIGHTS)) {
    if (k.includes(needle)) return w;
  }
  return SEVERITY_WEIGHTS.other;
}

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

  // Volume: log-scaled, saturates around ~50 cases.
  const volumeFactor = Math.min(1, Math.log10(1 + total) / Math.log10(1 + 50));

  // Recency: share in trailing 12 months, plus half-credit for cases in 13–24.
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

  // Severity: weighted average.
  const severityFactor =
    cases.reduce((acc, c) => acc + severityFor(c.natureOfSuit), 0) / total;

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
