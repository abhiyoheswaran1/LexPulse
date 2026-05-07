# LexPulse Risk Score — Methodology v3.0

**Version:** 3.0
**Effective date:** 2026-05-08
**Scope:** US federal civil litigation
**Supersedes (compatible):** v2.0 (`docs/methodology/risk-score-v2.md`)

## 1. What's new in v3.0

v3 adds **judge behavior weighting** to the score composition. Cases assigned to judges with low historical dismissal rates produce slightly higher risk scores; cases before high-dismissal judges produce slightly lower scores. The signal is multiplicative, bounded `[0.92, 1.10]`, and conservative — judges with insufficient sample data contribute neutrally.

Two seams added but not yet active:
- `firmSignalFactor` — for v3.1 law-firm-pattern detection
- `similaritySignalFactor` — for v3.2 embedding-based emerging-pattern detection

## 2. Composition

```
v3_score = clamp(0, 100,
            structural_score                     // v1 base
          + momentum_boost                       // v2
          + concentration_bonus                  // v2
        ) * jurisdiction_multiplier              // v2
          * judge_multiplier                     // v3 — NEW
```

**Implementation** uses `v3_score = round(v2_score · judge_multiplier)` where `v2_score` is the rounded integer output of v2's pipeline. This avoids re-rounding artifacts and preserves the monotonicity guarantee: when `judge_multiplier = 1.0`, `v3_score == v2_score` exactly.

## 3. judge_multiplier

For each company snapshot, gather the judges of all trailing-12mo cases. Look up `JudgeProfile` for each judge. The per-case multiplier:

```
judgeMultiplier(profile):
  if profile is null: 1.0
  if profile.caseCount < 5: 1.0
  if profile.dismissalRate is null: 1.0
  rate = clamp(0, 1, profile.dismissalRate)
  raw = 1.10 + (rate − 0.10) · −0.36       // line through (0.10, 1.10), (0.60, 0.92)
  return clamp(0.92, 1.10, raw)
```

Mapping anchors:
- 10% dismissal rate → multiplier **1.10** (cases tend to advance, real risk higher)
- 35% dismissal rate → multiplier **1.01** (near neutral, the "median" judge)
- 60% dismissal rate → multiplier **0.92** (judge dismisses heavily, real risk lower)

Per-company `judge_multiplier` is the **case-weighted mean** across all trailing-12mo cases. Cases with no judge or no profile contribute 1.0.

Bounded `[0.92, 1.10]`: at most ±10% movement in score from this factor alone. Composes with `jurisdiction_multiplier ∈ [0.85, 1.15]`, so combined factor is `[0.78, 1.27]` — total composition still subject to the outer `[0, 100]` clamp.

### Rationale

- Judges with very low dismissal rates (e.g. 10%) advance more cases through to discovery, motions, settlement; the realized cost / disclosure exposure is higher even controlling for case type.
- Judges with very high dismissal rates dispose quickly; the realized exposure is lower.
- The 35% anchor is roughly the median federal civil district judge (based on FJC reports we've reviewed informally; the official seed in this repo synthesizes profiles from in-DB stats).
- Judge-shopping (parties intentionally picking favorable judges) is a known confound. We don't try to control for it. Methodology limitation, called out in §7.

## 4. JudgeProfile data

Schema (`prisma/schema.prisma`):

```prisma
model JudgeProfile {
  judgeId           String  @id  // FK → Judge.id
  dismissalRate     Float?       // 0..1; null when caseCount < 5
  avgDurationDays   Int?
  plaintiffWinRate  Float?       // null until outcome data ingested (sub-project F)
  caseCount         Int     @default(0)
  computedAt        DateTime @default(now())
}
```

Profile computation (`scripts/seed-judges.ts`):

- `dismissalRate = (cases with dateTerminated AND duration < 90 days) / total terminated`. Threshold of 90 days is a heuristic for "quick disposal" (motion to dismiss, lack of standing, etc.). Subject to revision.
- `avgDurationDays = mean(dateTerminated - dateFiled)` over terminated cases.
- `plaintiffWinRate = null` for v3.0 — we don't yet ingest outcome data. Sub-project F will populate this from CourtListener docket entries and `Event.type ∈ {settlement, judgment_for_plaintiff, …}`.
- `caseCount = total assigned cases`. Sample size used for the gate.

Recompute cadence: weekly is sufficient. Profiles are stable on the timescale of weeks even at active courts.

### Limitations

- Synthetic seed data in dev DB produces realistic-shaped profiles but the dismissal rates are not actuarially calibrated. Production deployment expects real outcome data.
- We do not yet adjust for case-type mix per judge (a judge handling more contract cases will mechanically have higher dismissal rates than one handling more civil rights cases). Acceptable simplification for v3.0; called out as limitation.
- FJC bulk data licensing is a separate ops question (see ops decision logs).

## 5. New driver: `judge_skew`

```
ID: judge_skew
Fires when:
  meanJudgeDismissal != null
  AND judgeSampleSize >= 3
  AND meanJudgeDismissal < 0.25
Label:
  "Cases assigned to judges with low dismissal rates ({pct}% avg)"
Weight:
  min(1, (0.25 - meanJudgeDismissal) / 0.25)    // saturates at dismissal_rate = 0
Evidence:
  { mean_dismissal_rate, sample_size_judges }
```

`judgeSampleSize` is the number of distinct case-judge pairs in the trailing-12mo window where the judge has a valid profile (caseCount ≥ 5, dismissalRate not null). The 3-pair minimum prevents the driver from firing on a single low-sample judge.

## 6. Versioning

- v3.0 is methodology-defining.
- v2.0 methodology doc remains valid for `?version=v2` queries.
- API consumers may pin `?version=v2` or `?version=v3`.
- Persisted snapshots carry `scoreVersion`. Historical v1 and v2 rows are untouched.
- Patch revisions (v3.1, v3.2): activate the seam factors `firmSignalFactor` and `similaritySignalFactor` respectively. Composition formula will then become additive over those new components.

## 7. Limitations (v3-specific)

- **Judge-shopping:** parties may deliberately file in courts where favorable judges are likely. The score absorbs this bias as if it were intrinsic.
- **Coverage:** `Judge.id` is populated only when CourtListener provides `assigned_to`. Missing or "Unassigned" produces neutral 1.0.
- **Profile freshness:** profiles are point-in-time estimates; a judge's behavior can shift after appointment changes, reassignments, or new precedent.
- **Sample threshold:** `caseCount < 5` → multiplier 1.0. Small-court judges with few historical cases get no signal until profile data accumulates.

(Plus all v2 limitations — federal-civil only, no real-time, no outcome data, deterministic entity resolution.)

## 8. Reproducibility

A v3 snapshot stores: `score`, six v2 factors, `judgeFactor`, `firmSignalFactor`, `similaritySignalFactor`, `rawStats` JSON (with `meanJudgeDismissal` and `judgeSampleSize` among the v2 stats), `drivers` JSON, `delta7d`/`delta30d`. Combined with the JudgeProfile table at snapshot time, this is sufficient to reconstruct the score. No undocumented internal state contributes.

## 9. Forward compatibility

- v3.1 will populate `firmSignalFactor` from a forthcoming law-firm pattern detector. Schema is ready; ingestion of attorney/firm fields is pending.
- v3.2 will populate `similaritySignalFactor` from an embedding-based emerging-pattern detector. Schema is ready; the embedding pipeline is a separate infrastructure decision.
- v3.x patch revisions will not require schema migration; only activation of the seam factors and methodology doc updates.
