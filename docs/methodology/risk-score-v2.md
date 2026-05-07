# LexPulse Risk Score — Methodology v2.0

**Version:** 2.0
**Effective date:** 2026-05-08
**Scope:** US federal civil litigation

## 1. Scope

LexPulse Score v2 is computed from US federal civil court dockets (CourtListener / Free Law Project). State court filings, regulatory agency actions, arbitration, and international litigation are not yet covered. The score is intended for monitoring and triage — not for legal adjudication, not for credit underwriting in isolation, not for individual case prediction.

## 2. Output

Each scored entity (`Company`) receives a snapshot containing:

- `score` — integer ∈ [0, 100]
- `band` — one of {`low`, `moderate`, `elevated`, `high`}
- 6-factor `breakdown` — `volume`, `recency`, `severity`, `momentum`, `concentration`, `jurisdiction`
- 1–4 `drivers` — deterministic explanatory tags
- `change` — `delta_7d`, `delta_30d` (integer point change)
- `benchmark` — sector percentile + z-score, when cohort ≥ 30 peers

## 3. Composition

```
v2_score = clamp(0, 100,
            structural_score                       // v1 base
          + momentum_boost                         // -10 .. +10
          + concentration_bonus                    // 0 .. +10
        ) * jurisdiction_multiplier                // 0.85 .. 1.15
```

**Monotonicity guarantee:** when `momentum_boost = 0`, `concentration_bonus = 0`, and `jurisdiction_multiplier = 1.0`, `v2_score == v1_score`. Companies with no v2 signals therefore see no score change at the v1→v2 cutover.

### 3.1 structural_score (v1 base, preserved)

`structural_score = 100 · (0.35·V + 0.35·R + 0.3·S)`

- `V` = `min(1, log₁₀(1 + n) / log₁₀(51))` where `n` = total cases on record. Saturates near 50.
- `R` = `min(1, (recent_12 + 0.5·recent_24) / total)` where `recent_12` is cases in trailing 12 months, `recent_24` in 13–24 months.
- `S` = mean severity weight across all cases. Weights derive from JS-44 NOS code → category mapping (see §4).

### 3.2 momentum_boost

```
recent_30   = cases filed in trailing 30 days (skipping future-dated entries)
recent_12mo = cases filed in trailing 365 days (skipping future-dated entries)
baseline    = max(0.5, recent_12mo / 12)
momentum    = recent_30 / baseline
boost       = recent_12mo == 0 ? 0
                              : clamp(-10, +10, 10 · tanh(momentum − 1))
```

`tanh` saturates near ±1, so the practical range of `10 · tanh(momentum − 1)` is symmetric `[-10, +10]`. The 0.5 floor on `baseline` prevents amplification when activity is near zero. The `recent_12mo == 0` short-circuit makes momentum truly neutral for dormant companies (no decay penalty for entities that have always been quiet — the decay signal should fire only when *prior* activity has slowed).

Worked example: company with `recent_30 = 6` and `recent_12mo = 12` → baseline = 1.0, momentum = 6.0, boost = 10 · tanh(5) ≈ +10 (the hard cap).

### 3.3 concentration_bonus

Herfindahl-Hirschman index over the 12 NOS-category partition of trailing-12mo cases:

```
HHI       = Σ pᵢ²        for each occupied category i
N         = number of occupied categories
HHI_floor = 1 / N
```

```
N == 0 → bonus = 0           // no 12mo activity
N == 1 → bonus = total ≥ 3 ? 10 : 0
N ≥ 2 → bonus = clamp(0, +10, 10 · (HHI − HHI_floor) / (1 − HHI_floor))
```

Diffuse activity (cases evenly across many categories) → bonus 0. Activity concentrated in one category → bonus up to +10. The N=1 special case avoids 0/0 in the normalization.

### 3.4 jurisdiction_multiplier

Weighted average of court multipliers across trailing-12mo cases. Weight table:

| Court | Multiplier |
|---|---|
| SCOTUS | 1.15 |
| 2nd, 5th, 9th, 11th Circuit | 1.15 |
| DC, Federal Circuit | 1.10 |
| 1st, 3rd, 4th, 6th, 7th, 8th, 10th Circuit | 1.05 |
| Federal district (default) | 1.05 |
| Federal bankruptcy | 0.95 |
| Unknown / state | 1.00 |

Circuit weights reflect a combination of caseload, precedent influence, and remedy aggressiveness. They are deterministic and version-stable; revisions require a methodology version bump.

## 4. Case-type taxonomy

Source: PACER JS-44 Civil Cover Sheet, 12 categories. Severity weight per category is fixed:

| Category | Severity |
|---|---|
| securities | 0.95 |
| antitrust | 0.90 |
| RICO / false-claims | 0.90 |
| IP — patent | 0.75 |
| products liability | 0.70 |
| civil rights | 0.70 |
| environmental | 0.60 |
| ERISA | 0.55 |
| IP — trademark / copyright | 0.55 |
| employment / labor | 0.50 |
| tort / other | 0.40 |
| contract | 0.35 |
| tax | 0.30 |
| other | 0.30 |
| real property | 0.25 |

When the upstream feed returns a free-text label rather than a numeric code, we fall back to a curated case-insensitive regex set; unrecognized → `other`.

## 5. Drivers

Drivers are deterministic explanatory tags. Up to 4 fire per snapshot, sorted by weight descending. Templates and fire conditions:

| Template ID | Fires when |
|---|---|
| `risk_jump` | score increased ≥ 10 vs prior snapshot |
| `decay` | score decreased ≥ 10 vs prior snapshot |
| `case_spike` | recent_30 ≥ 2 × baseline AND recent_30 ≥ 3 |
| `severe_filing` | new case filed in last 7 days with category severity ≥ 0.7 |
| `category_concentration` | top category share ≥ 50% AND severity ≥ 0.6 |
| `federal_circuit_focus` | top circuit share ≥ 40% AND jurisdiction multiplier ≥ 1.10 |
| `dormant_to_active` | prior recent_30 was 0, current ≥ 2 |

No LLM is used. Driver text is a fixed template instantiated with numeric values from the snapshot. This is intentional: deterministic templates are auditable, repeatable, and reproducible — properties that matter for actuarial review, regulatory defense, and acquisition diligence.

## 6. Benchmarks

Per-snapshot percentile and z-score are computed against the company's sector cohort.

- **Sector classification:** hand-curated mapping (Russell 1000, NAICS-coded) + SEC EDGAR fallback. 11 sector buckets aligned to the GICS sector level (free generic names, not the licensed GICS taxonomy).
- **Cohort:** v2 snapshots of all companies sharing the same `sectorKey`, computed in the same job run (two-pass orchestration prevents bootstrap empty-cohort issues).
- **Gate:** when cohort size < 30, percentile, mean, median, and z-score return `null` with `reason: "cohort_too_small"`.
- **Outlier handling:** cohort scores are winsorized at the 99th percentile before computing mean and standard deviation.
- **Edge cases:** if all cohort scores are identical, z-score is 0 (stdev is floored at 1 to prevent NaN).

## 7. Limitations

- **Federal civil only.** State court filings, regulatory agency actions (SEC, FTC, NLRB, etc.), arbitration, and international litigation are not in v2.
- **Filing date only.** Outcome signals (settlement, dismissal type, damages) are not yet incorporated. Roadmap.
- **No real-time.** Refresh cadence depends on the upstream data source's update interval and our nightly job. Real-time webhooks (RECAP Search Alerts) are paid/enterprise tier and not used in v2.
- **Sector coverage is partial.** Companies without a ticker or unmatched in the seed set receive `sectorKey = null` and no benchmark.
- **Entity resolution is deterministic, not fuzzy.** Aliases, subsidiaries, and parent rollups are out of scope for v2.

## 8. Versioning policy

- This document defines methodology v2.0.
- Persisted snapshots carry `scoreVersion` so historical scores remain reproducible.
- **Patch revisions** (v2.1, v2.2, …): tweaks within existing component formulas. Annotated in CHANGELOG; no API contract change.
- **Major revisions** (v3.0): structural changes (new components, new composition, new taxonomy version). New `scoreVersion` value persisted.
- API consumers may pin `?version=v1` or `?version=v2`. Default returns the latest version.

## 9. Data sources

- **CourtListener / Free Law Project** — federal docket and opinion data. Licensed CC BY-ND 4.0. Attribution included on every API response (`sources` block) and in product UI footer.
- **SEC EDGAR** — public company → CIK and SIC mapping for sector classification fallback.
- **Hand-curated Russell 1000 set** — supplements EDGAR with NAICS-aligned LexPulseSector keys.

## 10. Reproducibility

A snapshot's stored values — `score`, six breakdown factors, `drivers` JSON, benchmark fields, `scoreVersion` — are sufficient to reconstruct the score under the formulas above. No undocumented internal state contributes to the output. Anyone with the case set, NOS table version, and weights can verify the score independently.

---

## Appendix A — Worked end-to-end example

Company X, federal-only, today 2026-05-08:

- 24 cases over the past 5 years.
- 18 cases in trailing 24 months; of those, 12 in trailing 12 months; of those, 4 in trailing 30 days.
- NOS distribution in trailing 12mo: 7 securities (850), 4 contract (110), 1 patent (830).
- Courts: 3 in `cand` (9th Circuit district), 5 in `nysd` (2nd Circuit district), 4 in `cacd` (9th Circuit district).

**v1 base:**
- V = log₁₀(25)/log₁₀(51) = 1.398/1.708 = 0.819
- R = (12 + 0.5·6) / 24 = 0.625
- S (over all 24): assume mean severity ≈ 0.65
- structural = 100·(0.35·0.819 + 0.35·0.625 + 0.3·0.65) = 100·(0.287 + 0.219 + 0.195) = 70.1 → 70

**v2 adjustments:**
- baseline = max(0.5, 12/12) = 1.0; momentum = 4/1.0 = 4.0; boost = 10·tanh(3) ≈ +9.95 → +10 (cap close)
- Categories: securities=7, contract=4, patent=1 → shares 0.583, 0.333, 0.083; HHI = 0.34+0.11+0.007 = 0.457; N=3; HHI_floor=0.333; bonus = 10·(0.457−0.333)/(1−0.333) = 10·0.186 = +1.86 → ~2
- Jurisdiction: weighted average over 12mo cases. All 12 in 2nd or 9th Circuit districts, so weight = 1.05 (district default) for each → multiplier = 1.05.

Composition: clamp(0,100, 70 + 10 + 2) = 82, × 1.05 = 86.1 → **86**.

Drivers fired (illustrative):
- `case_spike` — recent_30=4, baseline=1.0/mo (label: "Spike in filings: 4 cases vs 1.0/mo baseline", weight ~1.0)
- `severe_filing` — if any of the 4 recent-7d cases is securities (label: "New securities case (...)", weight 0.95)
- `category_concentration` — securities at 58% share, severity 0.95 (label: "Concentration in securities (58% of recent activity)", weight 0.55)

Final score: 86 · band = `high`.
