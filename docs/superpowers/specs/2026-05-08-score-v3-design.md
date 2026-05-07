# Score v3 — Design Spec

**Date:** 2026-05-08
**Status:** Approved (pre-implementation)
**Milestone:** Sub-project D — Score v3 (judge weighting layer)
**Scope:** Just the judge component. Law-firm and embedding-similarity get schema seams only and are deferred to v3.1 / v3.2.

## 1. Goal

Add **judge behavior weighting** to the LexPulse risk score. A case before a judge with a high dismissal rate signals lower realized risk than the same case before a judge with a low dismissal rate. Score v3 captures this with a multiplicative `judge_multiplier ∈ [0.92, 1.10]`.

The acquirer narrative: judges are a factor real-world risk teams already track informally; codifying it into the score (with audit trail) is incremental but defensible signal.

## 2. Architecture

```
ingestion → entity resolution → SCORING ENGINE V3 → DRIVERS → BENCHMARKS → snapshot → API → UI
                                    (extended)
```

Pipeline shape unchanged. v2 lives on for `?version=v2` replay. v3 is the new default.

### Files added

- `src/lib/judges.ts` — `judgeMultiplier(profile)` + cohort aggregator
- `src/lib/__tests__/judges.test.ts`
- `scripts/seed-judges.ts` — populate `JudgeProfile` from existing data
- migration directory for `score-v3`

### Files modified

- `prisma/schema.prisma` — add `JudgeProfile` model; add `judgeFactor`, `firmSignalFactor`, `similaritySignalFactor` to `RiskScore`
- `src/lib/risk.ts` — add `computeRiskV3` (preserves v2)
- `src/lib/drivers.ts` — add `judge_skew` template
- `scripts/compute-risk.ts` — call v3, persist judge factor, fetch JudgeProfile cache
- `src/app/api/companies/[id]/risk/route.ts` — bump version label, add `judge` to `breakdown`, support `?version=v3`
- `src/components/ScoreGauge.tsx` — add 7th breakdown bar
- `src/app/companies/[id]/page.tsx` — add `Judge` factor bar
- `docs/methodology/risk-score-v3.md` — new methodology doc

## 3. Schema

```prisma
model JudgeProfile {
  judgeId            String   @id
  dismissalRate      Float?     // 0..1; null when sample < 5
  avgDurationDays    Int?
  plaintiffWinRate   Float?     // 0..1; null when no terminated outcomes
  caseCount          Int        // sample size used for the estimate
  computedAt         DateTime   @default(now())
  judge              Judge      @relation(fields: [judgeId], references: [id])
  @@map("judge_profiles")
}

// Add to RiskScore:
judgeFactor              Float    @default(1)
firmSignalFactor         Float    @default(0)
similaritySignalFactor   Float    @default(0)
```

All new RiskScore columns are additive with safe defaults. Migration: `score-v3`. Existing v1/v2 rows get default values (`judgeFactor=1`, others=0).

## 4. Math

### 4.1 Composition

```
v3_score = clamp(0, 100,
            structural_score
          + momentum_boost
          + concentration_bonus
        ) * jurisdiction_multiplier * judge_multiplier
```

The two multiplicative factors compose. Both bounded near 1.0; product still bounded.

### 4.2 judge_multiplier

For each company, gather the assigned judges of all trailing-12-month cases. Look up `JudgeProfile` per judge.

```
judgeMultiplier(profile) =
  if profile is null OR profile.dismissalRate is null OR profile.caseCount < 5: 1.0
  else:
    // Map dismissal rate (0..1) to multiplier:
    //   high dismissal (0.6) → 0.92 (judge tends to dismiss → lower realized risk)
    //   median (0.35) → 1.00 (neutral)
    //   low dismissal (0.10) → 1.10 (judge advances cases → higher realized risk)
    // Linear interpolation between the three anchors, clamped.
    rate = clamp(0, 1, profile.dismissalRate)
    raw = 1.10 - (rate - 0.10) * (0.18 / 0.50)   // line through (0.10, 1.10)..(0.60, 0.92)
    return clamp(0.92, 1.10, raw)
```

Per-company multiplier is the case-weighted average of `judgeMultiplier` across trailing-12mo cases. Cases with no judge or no profile contribute `1.0`.

### 4.3 Monotonicity

When `judge_multiplier == 1.0` (no judge data), `v3_score == v2_score`. This preserves the v2→v3 transition at zero risk to scores.

## 5. JudgeProfile data source

For v3.0, populate from an offline script (`scripts/seed-judges.ts`) that:

1. Pulls `Judge` rows from DB.
2. Computes per-judge stats from terminated cases:
   - `dismissalRate = (cases with dateTerminated AND duration < 90 days) / total terminated`
   - `avgDurationDays = mean(dateTerminated - dateFiled)`
   - `plaintiffWinRate = null` (we don't have outcome data — leave for sub-project F)
   - `caseCount = total assigned`
3. Upserts `JudgeProfile` rows.

For demo/synthetic data (current dev DB), the script will produce reasonable randomized profiles per judge so the v3 signal is visible.

A future task (sub-project F backtest) replaces this with real terminated-case outcome extraction from CourtListener docket entries.

## 6. New driver

```
ID: judge_skew
Fires when:
  - At least 3 trailing-12mo cases have a judge with a JudgeProfile (caseCount >= 5)
  - Mean dismissalRate over those judges < 0.25
Label:
  "Cases assigned to judges with low dismissal rates ({pct}% avg)"
Weight:
  (0.25 - mean_dismissal) / 0.25  (saturates at dismissal_rate = 0)
Evidence:
  { mean_dismissal_rate, sample_size_judges }
```

Tests: synthetic fixture verifies firing condition + threshold edges.

## 7. API contract

Bumped to `v3.0`:

```
GET /api/companies/:id/risk

200 {
  "version": "v3.0",
  ...
  "breakdown": {
    "volume": ...,
    "recency": ...,
    "severity": ...,
    "momentum": ...,
    "concentration": ...,
    "jurisdiction": 1.08,
    "judge": 1.04                    // NEW
  },
  "drivers": [
    { "type": "judge_skew", "label": "Cases assigned to judges...", "weight": 0.6, "evidence": {...} }
    // ...other v2 drivers
  ],
  ...
}
```

`?version=v2` returns the latest v2 snapshot if any. `?version=v3` returns v3 (default behavior).

## 8. UI

`ScoreGauge.tsx` accepts an optional `judge` field on `breakdown`. Renders as a 7th bar (`jud`).

Profile page adds a `Judge` factor bar in the score header.

No new pages.

## 9. Versioning policy

- New methodology doc `docs/methodology/risk-score-v3.md` (separate from v2's; v2 doc preserved unchanged).
- Snapshots persist with `scoreVersion = "v3"` going forward.
- v2 historical rows untouched.
- Default API returns latest version.

## 10. Risks

| Risk | Mitigation |
|---|---|
| JudgeProfile data quality is poor early | Profiles with caseCount < 5 → multiplier 1.0 (skip). Documented gate. |
| Judge-shopping bias (parties pick favorable judges) | Acknowledged in methodology limitations section; out of scope for the math. |
| v2 → v3 migration changes scores meaningfully | Monotonicity guarantee: judge_multiplier=1.0 when no profiles → v3==v2. Companies with judge data see ±10% change at most. |
| FJC data licensing | Defer to v3.1 — current synthetic seed avoids the question. |

## 11. Testing strategy

Existing 39 tests stay green. Add:
- 5–8 tests in `judges.test.ts` (multiplier math, edge cases, aggregator)
- 1–2 tests in `risk.test.ts` (v3 monotonicity vs v2; judge_multiplier applied)
- 1 test in `drivers.test.ts` (judge_skew template fires correctly)

CI: `npm test`, `npm run typecheck`, `npm run build` — all must pass.

## 12. Implementation order

1. Schema migration + Prisma generate
2. `src/lib/judges.ts` + tests
3. `src/lib/risk.ts` v3 extension + tests (preserves v2)
4. `src/lib/drivers.ts` `judge_skew` template + tests
5. `scripts/seed-judges.ts` + manual run
6. `scripts/compute-risk.ts` orchestration update
7. API route v3 contract
8. UI updates
9. Methodology doc
10. End-to-end smoke + commit + push
