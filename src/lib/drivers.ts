// Driver-template engine.
//
// Pure, deterministic. Same inputs → same output (up to JSON serialization).
// No LLM. Templates fire on structured signals; first 4 to fire (sorted by
// weight desc) win.

import { categorize, severityForCategory, type NosCategory } from "./case-types";

export type Driver = {
  label: string;
  weight: number;          // 0..1, sort key
  type: string;            // template id
  evidence: Record<string, unknown>;
};

export type DriverSnapshot = {
  score: number;
  // null on `prev` means: prior snapshot exists but its raw stats weren't
  // persisted (legacy row). Drivers that depend on prior recent30 must
  // not fire in that case.
  recent30: number | null;
  baselineMonthly: number;
  topCategory: NosCategory | null;
  topCategoryShare: number;
  topCircuit: string | null;
  topCircuitShare: number;
  jurisdictionFactor: number;
  // 12mo case count — used by category_concentration to avoid firing on
  // single-case companies (one-case-in-securities ≠ "concentration").
  cat12moTotal?: number;
  // Judge signals (v3): mean dismissal rate over case-judges with valid
  // profiles, and the sample size. Used by judge_skew template.
  meanJudgeDismissal?: number | null;
  judgeSampleSize?: number;
};

export type NewCase = {
  caseName: string;
  natureOfSuit: string | null;
  dateFiled: Date;
};

export type DriverInput = {
  curr: DriverSnapshot;
  prev: DriverSnapshot | null;
  newCases7d: NewCase[];
};

const CATEGORY_LABEL: Record<NosCategory, string> = {
  securities: "securities",
  antitrust: "antitrust",
  rico_falseclaims: "RICO/false-claims",
  ip_patent: "patent",
  ip_trademark_copyright: "trademark/copyright",
  civil_rights: "civil rights",
  employment_labor: "employment/labor",
  products_liability: "products liability",
  environmental: "environmental",
  erisa: "ERISA",
  contract: "contract",
  real_property: "real property",
  tax: "tax",
  tort_other: "tort",
  other: "other",
};

const CIRCUIT_LABEL: Record<string, string> = {
  scotus: "U.S. Supreme Court",
  ca1: "1st Circuit", ca2: "2nd Circuit", ca3: "3rd Circuit", ca4: "4th Circuit",
  ca5: "5th Circuit", ca6: "6th Circuit", ca7: "7th Circuit", ca8: "8th Circuit",
  ca9: "9th Circuit", ca10: "10th Circuit", ca11: "11th Circuit",
  cadc: "DC Circuit", cafc: "Federal Circuit",
};

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function generateDrivers(input: DriverInput): Driver[] {
  const { curr, prev, newCases7d } = input;
  const candidates: Driver[] = [];

  // risk_jump: score climbed >= 10
  if (prev && curr.score - prev.score >= 10) {
    const delta = curr.score - prev.score;
    candidates.push({
      type: "risk_jump",
      label: `Risk score climbed +${delta} since last snapshot`,
      weight: Math.min(1, Math.abs(delta) / 20),
      evidence: { from: prev.score, to: curr.score, delta },
    });
  }

  // decay: score fell >= 10
  if (prev && prev.score - curr.score >= 10) {
    const delta = curr.score - prev.score;
    candidates.push({
      type: "decay",
      label: `Risk eased ${delta} as case activity slowed`,
      weight: Math.min(1, Math.abs(delta) / 20),
      evidence: { from: prev.score, to: curr.score, delta },
    });
  }

  // case_spike: recent30 >= 2 * baseline AND >= 3
  if (curr.recent30 != null && curr.recent30 >= 3 && curr.recent30 >= 2 * curr.baselineMonthly) {
    candidates.push({
      type: "case_spike",
      label: `Spike in filings: ${curr.recent30} cases vs ${curr.baselineMonthly.toFixed(1)}/mo baseline`,
      weight: Math.min(1, curr.recent30 / Math.max(curr.baselineMonthly, 1) / 4),
      evidence: { recent30: curr.recent30, baseline_monthly: Number(curr.baselineMonthly.toFixed(2)) },
    });
  }

  // severe_filing: any new case in last 7 days with category severity >= 0.7
  for (const nc of newCases7d) {
    const cat = categorize(nc.natureOfSuit);
    const sev = severityForCategory(cat);
    if (sev >= 0.7) {
      candidates.push({
        type: "severe_filing",
        label: `New ${CATEGORY_LABEL[cat]} case (${nc.caseName} filed ${fmtDate(nc.dateFiled)})`,
        weight: sev,
        evidence: { caseName: nc.caseName, category: cat, dateFiled: fmtDate(nc.dateFiled) },
      });
    }
  }

  // category_concentration: topCategoryShare >= 0.5 AND severity >= 0.6 AND
  // at least 3 cases in the trailing 12 months (avoid firing on single-case
  // companies where "concentration" is trivial).
  if (
    curr.topCategory &&
    curr.topCategoryShare >= 0.5 &&
    (curr.cat12moTotal ?? 0) >= 3
  ) {
    const sev = severityForCategory(curr.topCategory);
    if (sev >= 0.6) {
      const pct = Math.round(curr.topCategoryShare * 100);
      candidates.push({
        type: "category_concentration",
        label: `Concentration in ${CATEGORY_LABEL[curr.topCategory]} (${pct}% of recent activity)`,
        weight: curr.topCategoryShare * sev,
        evidence: {
          category: curr.topCategory,
          share: Number(curr.topCategoryShare.toFixed(2)),
          cat12moTotal: curr.cat12moTotal ?? null,
        },
      });
    }
  }

  // federal_circuit_focus: topCircuitShare >= 0.4 AND jurisdictionFactor >= 1.1
  if (curr.topCircuit && curr.topCircuitShare >= 0.4 && curr.jurisdictionFactor >= 1.1) {
    candidates.push({
      type: "federal_circuit_focus",
      label: `Increased activity in ${CIRCUIT_LABEL[curr.topCircuit] ?? curr.topCircuit} federal court`,
      weight: curr.topCircuitShare * (curr.jurisdictionFactor - 1.0),
      evidence: {
        circuit: curr.topCircuit,
        share: Number(curr.topCircuitShare.toFixed(2)),
        jurisdictionFactor: Number(curr.jurisdictionFactor.toFixed(2)),
      },
    });
  }

  // dormant_to_active: prev recent30 == 0 (strictly known), current >= 2.
  // null prev.recent30 (legacy snapshot, no rawStats) does NOT fire — we
  // refuse to guess.
  if (prev && prev.recent30 === 0 && curr.recent30 != null && curr.recent30 >= 2) {
    candidates.push({
      type: "dormant_to_active",
      label: `First litigation activity in 6+ months`,
      weight: Math.min(1, curr.recent30 / 3),
      evidence: { recent30: curr.recent30 },
    });
  }

  // judge_skew (v3): low average dismissal rate across the company's case
  // judges signals cases tend to advance in this judicial environment.
  // Requires >= 3 judge-profile data points to fire.
  if (
    curr.meanJudgeDismissal != null &&
    (curr.judgeSampleSize ?? 0) >= 3 &&
    curr.meanJudgeDismissal < 0.25
  ) {
    const pct = Math.round(curr.meanJudgeDismissal * 100);
    candidates.push({
      type: "judge_skew",
      label: `Cases assigned to judges with low dismissal rates (${pct}% avg)`,
      weight: Math.min(1, (0.25 - curr.meanJudgeDismissal) / 0.25),
      evidence: {
        mean_dismissal_rate: Number(curr.meanJudgeDismissal.toFixed(3)),
        sample_size_judges: curr.judgeSampleSize,
      },
    });
  }

  candidates.sort((a, b) => b.weight - a.weight);
  return candidates.slice(0, 4);
}
