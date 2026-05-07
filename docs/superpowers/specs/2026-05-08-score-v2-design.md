# Score v2 — Design Spec

**Date:** 2026-05-08
**Status:** Approved (pre-implementation)
**Milestone:** Sub-project C — *Score v2 + Drivers + Change Deltas + Benchmarks*
**Endgame bias:** Sell to Tier 1 incumbent (Moody's / Verisk / RELX / TR / S&P / MSCI / Sayari)

## 1. Goal & non-goals

### Goal

Turn the LexPulse risk score from a bare number into a **legible, comparable, change-aware product**: every score response includes (a) a breakdown across six components, (b) 1–4 deterministic driver explanations, (c) 7-day and 30-day change deltas, and (d) a sector benchmark percentile. Ship dashboard surface first; freeze a versioned API contract behind it.

### Non-goals (deferred to other sub-projects)

- ML-backed case classifier — JS-44 NOS code mapping is deterministic and sharper.
- Outcome / damages extraction — depends on coverage of docket entries (sub-project B).
- Embedding similarity, judge weighting, law-firm pattern, network signals — sub-project D (Score v3).
- State court coverage — sub-project B; v2 is **explicitly federal-civil only**.
- Multi-tenant auth, billing, API keys, alert delivery (email/Slack/webhook) — sub-project E.
- Backtest harness, methodology calibration vs material events — sub-project F.

## 2. Architecture

The pipeline shape is unchanged. Scoring is extended; two pure modules added.

```
ingestion → entity resolution → SCORING ENGINE V2 → DRIVERS → BENCHMARKS → snapshot → API → UI
                                    (extended)        (new)      (new)
```

### Files added

- `src/lib/case-types.ts` — JS-44 NOS code list → 12 categories → severity weights
- `src/lib/jurisdiction.ts` — court ID → level (federal/state) and federal circuit → multiplier
- `src/lib/drivers.ts` — pure deterministic driver template engine
- `src/lib/benchmarks.ts` — sector cohort + percentile + z-score
- `src/lib/__tests__/*` — vitest unit tests for the above
- `scripts/seed-sectors.ts` — populate `Sector` table + assign companies via EDGAR / Russell 1000 mapping
- `prisma/seed-sectors.csv` — hand-curated Russell 1000 → LexPulseSector mapping
- `docs/methodology/risk-score-v2.md` — first-class methodology doc, acquirer-grade
- `vitest.config.ts` + `tsconfig.test.json` — test scaffolding

### Files modified

- `src/lib/risk.ts` — add `computeRiskV2()`; keep `computeRisk()` (v1) callable for replay
- `scripts/compute-risk.ts` — orchestrate v2, drivers, benchmarks; persist enriched snapshot
- `prisma/schema.prisma` — additive: `Sector`, `Company` extensions, `RiskScore` extensions
- `src/app/api/companies/[id]/risk/route.ts` — new (or replacing existing) v2 contract
- `src/components/RiskBadge.tsx`, `ScoreGauge.tsx` — delta + 6-bar breakdown
- `src/app/companies/[id]/page.tsx` — Drivers panel + Sector benchmark panel
- `src/app/page.tsx` — "Biggest movers (7d)" panel
- `package.json` — add `vitest`, `@vitest/ui`; add `test`, `typecheck` scripts

### Files untouched

- Ingestion (`scripts/ingest.ts`)
- Entity resolution (`src/lib/resolve.ts`)
- Existing alert engine logic (alerts list / dashboard endpoints)

## 3. Schema additions (Prisma)

All additions are nullable so existing rows stay valid. One additive migration: `score-v2`.

```prisma
model Sector {
  key            String    @id          // "energy", "financials", "healthcare", ...
  label          String                  // "Energy", "Financials", "Health Care"
  naicsPrefixes  String[]                // for inverse lookup, e.g. ["52", "523"]
  companies      Company[]
  @@map("sectors")
}

model Company {
  // ... existing fields unchanged
  naicsCode         String?
  sectorKey         String?
  sector            Sector?  @relation(fields: [sectorKey], references: [key])
  sectorSource      String?  // "edgar" | "manual" | "russell1000"
  sectorConfidence  Float?   // 0..1
  @@index([sectorKey])
}

model RiskScore {
  // ... existing fields unchanged
  // v2 components:
  momentumFactor       Float    @default(0)
  concentrationFactor  Float    @default(0)
  jurisdictionFactor   Float    @default(1)
  // versioning:
  scoreVersion         String   @default("v1")
  // drivers (denormalized JSON for cheap reads):
  drivers              Json?
  // change deltas (precomputed at write):
  delta7d              Int?
  delta30d             Int?
  // benchmark fields (gated on cohortSize >= 30):
  cohortSize           Int?
  cohortP50            Int?
  cohortMean           Float?
  percentile           Float?
  zScore               Float?
}
```

Migration plan: `npx prisma migrate dev --name score-v2`. Existing `RiskScore` rows get default values (`momentumFactor=0`, `concentrationFactor=0`, `jurisdictionFactor=1`, `scoreVersion="v1"`) so backward compatibility is automatic.

## 4. Scoring math v2

### Composition

Score ∈ [0, 100]. We compose v1 (structural risk) with v2 adjustments:

```
v2_score = clamp(0, 100,
    structural_score                      // exact v1 calculation
  + momentum_boost                        // -10 .. +20
  + concentration_bonus                   // 0   .. +10
) * jurisdiction_multiplier               // 0.85 .. 1.15
```

Re-clamped after multiplier. **Monotonicity guarantee:** when `momentum_boost = 0`, `concentration_bonus = 0`, and `jurisdiction_multiplier = 1.0`, `v2_score == v1_score`. This preserves continuity for companies with diffuse, unchanging activity.

### Component formulas

**`structural_score`** = `100 · (0.35·volumeFactor + 0.35·recencyFactor + 0.3·severityFactor)`. Unchanged from v1, but `severityFactor` now derives from JS-44 NOS code mapping (see §4.1) rather than substring matching.

**`momentum_boost`** is a soft-capped deviation between 30-day activity and the 12-month baseline:

```
recent30   = count of dateFiled in trailing 30 days
recent12mo = count in trailing 365 days
baseline   = max(0.5, recent12mo / 12)         // floor avoids div-by-zero noise
momentum   = recent30 / baseline                // 1.0 = on trend
boost      = clamp(-10, +20, 10 * tanh(momentum - 1))
```

Worked example: company with `recent30=6` and `recent12mo=12` → `baseline=1.0`, `momentum=6.0`, `boost=10·tanh(5) ≈ +10`. Capped at +20 for runaway momentum.

**`concentration_bonus`** is a Herfindahl-Hirschman index over the 12 NOS categories:

```
categories = trailing-12mo cases bucketed by NOS category (12 buckets)
shares     = [count_i / total for each bucket]
HHI        = Σ shares²
HHI_floor  = 1 / N where N = number of nonempty buckets
bonus      = clamp(0, +10, 10 * (HHI − HHI_floor) / (1 − HHI_floor))
```

Worked example: 10 cases all in one category → `HHI=1.0`, bonus≈+10. 10 cases evenly across 5 categories → `HHI=0.2`, `HHI_floor=0.2`, bonus=0. 8 in one category, 2 in another → `HHI≈0.68`, bonus≈+6.

**`jurisdiction_multiplier`** is a weighted average of court multipliers across the company's trailing-12mo cases:

```
court_weight(court_id):
  federal SCOTUS                       → 1.15
  federal circuit (1st-11th, DC, Fed) → 1.05 .. 1.15  (per circuit weight table)
  federal district (default)          → 1.05
  federal bankruptcy                  → 0.95
  state (any)                         → 0.85       // we don't actually have these in v2
  unknown                             → 1.00
multiplier = weighted average across trailing-12mo cases (by case count)
```

Circuit weights (informed by case-volume-per-population for civil filings, defensible in methodology doc):
- 9th, 2nd, 5th, 11th: 1.15 (highest-impact circuits)
- 1st, 3rd, 4th, 6th, 7th, 8th, 10th, DC, Fed: 1.05–1.10
- District-only (no circuit detected): 1.05
- Unknown: 1.00

### 4.1 Case-type taxonomy (JS-44 NOS codes)

Source: PACER JS-44 Civil Cover Sheet, ~80 numeric codes grouped into 12 categories. Codes are stable, enumerated, and auditable.

Severity weight per category (ranges illustrative; finalize in `case-types.ts`):
- **Securities & antitrust** (codes 850, 410): 0.95
- **RICO & false claims** (470, 375, 376): 0.90
- **IP — patents** (830): 0.75
- **IP — trademark/copyright** (820, 840): 0.55
- **Civil rights — class** (440-446 with class indicator): 0.70
- **Employment & labor** (442, 720s): 0.50
- **Products liability** (365, 367, 368): 0.70
- **Environmental** (893): 0.60
- **ERISA** (791): 0.55
- **Contract** (110-196): 0.35
- **Real property** (210-290): 0.25
- **Other** (default): 0.30

Implementation: `src/lib/case-types.ts` exports `NOS_CATEGORY: Record<string, NosCategory>` (full ~80 codes), `CATEGORY_SEVERITY: Record<NosCategory, number>`, plus a fallback for nature-of-suit strings that come in as labels rather than codes (CourtListener returns both forms).

## 5. Drivers

### Output shape

```ts
type Driver = {
  label: string          // human-readable, ≤ 90 chars
  weight: number         // 0..1, used for sort + visual sizing
  type: string           // template id (e.g. "case_spike", "category_concentration")
  evidence: object       // structured payload for tooltips, debug, audit
}
```

Up to 4 drivers per snapshot. Stored as JSON on `RiskScore.drivers`. Sorted by weight desc.

### Templates (priority order — first 4 to fire win)

| ID | Fire condition | Label template | Weight |
|---|---|---|---|
| `risk_jump` | `score − prev.score ≥ 10` | `Risk score climbed +{delta} since last snapshot` | `min(1, abs(delta)/20)` |
| `case_spike` | `recent30 ≥ 2·baseline` AND `recent30 ≥ 3` | `Spike in filings: {recent30} cases vs {baseline}/mo baseline` | `min(1, (recent30/max(baseline,1))/4)` |
| `severe_filing` | New case in last 7 days with category severity ≥ 0.7 | `New {category} case ({caseName} filed {dateFiled})` | `severity` |
| `category_concentration` | `topCategoryShare ≥ 0.5` AND `severity(topCategory) ≥ 0.6` | `Concentration in {category} ({share}% of recent activity)` | `topShare · severity` |
| `federal_circuit_focus` | `topCircuitShare ≥ 0.4` AND `circuitWeight ≥ 1.1` | `Increased activity in {circuit} federal court` | `topCircuitShare · (circuitWeight − 1.0)` |
| `dormant_to_active` | `prev.recent30 == 0` AND `recent30 ≥ 2` | `First litigation activity in {monthsSince} months` | `min(1, recent30/3)` |
| `decay` | `prev.score − score ≥ 10` | `Risk eased −{delta} as case activity slowed` | `min(1, abs(delta)/20)` |

**Determinism**: same inputs → same drivers, same weights, same ordering. Tested with fixtures.

**No LLM**: deliberate. Acquirer audit, regulator review, backtest reproducibility all require deterministic explainability.

## 6. Benchmarks

### Two-pass orchestration (important for bootstrap)

Day-1 challenge: when v2 first ships, no v2 snapshots exist yet, so a single-pass "look up sibling v2 snapshots" returns an empty cohort for everyone. Solution: `compute-risk.ts` runs in two passes.

```
pass 1: for each company → compute v2 breakdown + drivers (no benchmark yet)
        accumulate { sectorKey: [scores...] } in memory
pass 2: for each company → look up its sector's accumulated scores
        if cohort.size < 30: percentile = null, reason = "cohort_too_small"
        else compute percentile, z-score, cohortP50, cohortMean, cohortSize
        persist RiskScore row with full v2 + benchmark fields
```

Two-pass is in-memory and runs once per nightly job; trivial cost. Subsequent runs are still two-pass for consistency (benchmarks always reflect the current run's scores, not yesterday's).

### Math

```
scores      = winsorize(cohort.scores, p99)
cohortMean  = mean(scores)
cohortP50   = median(scores)
zScore      = (company.score − cohortMean) / max(stdev(scores), 1)   // floor avoids div-by-zero
percentile  = (count(s in scores: s ≤ company.score) / cohort.size) · 100
cohortSize  = cohort.size
```

`stdev` floor at 1 prevents undefined z-scores in degenerate cohorts (all scores identical).

### Sector mapping

`scripts/seed-sectors.ts`:
1. Load `prisma/seed-sectors.csv` — hand-curated `(ticker, name, naicsCode, sectorKey, source="russell1000")`.
2. Upsert `Sector` rows from a static `LEXPULSE_SECTORS` constant in code (11 keys).
3. Match Companies by `ticker` → assign `sectorKey`, `sectorSource`, `sectorConfidence=1.0`.
4. For Companies with no ticker, attempt SEC EDGAR CIK lookup via name → SIC → mapped sectorKey, `sectorConfidence=0.7`.
5. Companies with no match → `sectorKey=null`, `sectorSource=null`. Eligible for benchmark only when set.

### LexPulseSector keys (11 buckets, GICS-sector-aligned, generic names)

`energy`, `materials`, `industrials`, `consumer_discretionary`, `consumer_staples`, `healthcare`, `financials`, `information_technology`, `communication_services`, `utilities`, `real_estate`.

## 7. API contract (frozen at v2.0)

```
GET /api/companies/:id/risk

200 {
  "score": 67,
  "band": "elevated",
  "computed_at": "2026-05-08T12:00:00Z",
  "version": "v2.0",
  "change": {
    "delta_7d": 12,
    "delta_30d": 18
  },
  "drivers": [
    {
      "label": "Spike in employment class actions",
      "weight": 0.78,
      "type": "case_spike",
      "evidence": { "recent30": 7, "baseline_monthly": 1.4 }
    }
  ],
  "breakdown": {
    "volume": 0.71,
    "recency": 0.84,
    "severity": 0.55,
    "momentum": 0.62,
    "concentration": 0.41,
    "jurisdiction": 1.08
  },
  "benchmark": {
    "sector": "healthcare",
    "cohort_size": 142,
    "percentile": 87.3,
    "sector_median": 41,
    "z_score": 1.42
  },
  "sources": [
    { "name": "CourtListener / Free Law Project", "license": "CC BY-ND 4.0", "url": "https://www.courtlistener.com/" }
  ]
}

404 — company not found
```

Response is null-safe: `benchmark` is null when cohort < 30 (with reason); `change` deltas are null when no prior snapshot exists in the window. `version` allows clients to pin.

## 8. UI surface (dashboard-first)

### Components touched

- `src/components/RiskBadge.tsx` — append delta arrow + colored delta number after score (up red, down green per litigation-risk semantic — *risk going down is good*).
- `src/components/ScoreGauge.tsx` — tooltip becomes 6-bar mini-chart (volume / recency / severity / momentum / concentration / jurisdiction).
- New `src/components/DriversPanel.tsx` — chip list, color-coded by driver type, click to expand evidence.
- New `src/components/BenchmarkPanel.tsx` — small distribution chart (Recharts) with percentile callout. When cohort < 30, panel renders an explanatory empty state.
- New `src/components/MoversPanel.tsx` — top 10 by `|delta_7d|`, with sparkline.

### Pages touched

- `src/app/companies/[id]/page.tsx` — `<DriversPanel />` and `<BenchmarkPanel />` above the existing case timeline.
- `src/app/page.tsx` (dashboard) — `<MoversPanel />` added to the existing layout.

No new routes. No nav changes.

## 9. Versioning policy

- All v2-onwards snapshots written with `scoreVersion = "v2"`.
- Historical v1 rows untouched (default-filled with v2 column defaults at migration time).
- API serves latest version per company by default; `?version=v1` returns v1 if any.
- UI annotates the discontinuity at the first v2 snapshot per company ("methodology updated 2026-05-08") in trend visualizations.
- Methodology doc: `docs/methodology/risk-score-v2.md` is the authoritative reference and is committed/tagged with each minor revision (`v2.0`, `v2.1`).

## 10. Methodology doc — required deliverable

`docs/methodology/risk-score-v2.md`. Treat as a shipping artifact, not a side note. Sections (mirrors §4–§6 of this spec but written for an external reader — actuary, regulator, acquirer):

1. **Scope** — federal civil only, US, post-2010 reliable date_filed coverage.
2. **Components** — formulas, worked examples for each.
3. **Composition** — base + adjustments, monotonicity guarantee.
4. **Drivers** — full template catalog.
5. **Benchmarks** — cohort definition, percentile + z-score math, edge cases.
6. **Limitations** — coverage gaps, missing outcome signals, real-time gap, named.
7. **Versioning policy.**
8. **Data sources & licensing** — CourtListener attribution, FLP partnership status.

## 11. Testing strategy

Add `vitest` + `@vitest/ui` to dev dependencies. Add `npm test` and `npm run typecheck` scripts.

| Module | Tests |
|---|---|
| `src/lib/case-types.ts` | NOS code → category → severity for each ~80 codes; unmapped → "other"; label fallback |
| `src/lib/jurisdiction.ts` | Court ID → multiplier table; unknown → 1.0 |
| `src/lib/risk.ts` | v1 unchanged for empty/single-case; v2 monotonicity (when no v2 signal, v2_score == v1_score); momentum cap; concentration formula; full-pipeline fixture |
| `src/lib/drivers.ts` | One fixture per template; priority order; max 4 cap; no false positives on bland data |
| `src/lib/benchmarks.ts` | Cohort < 30 → null; winsorize at p99; percentile rank; z-score |
| `scripts/compute-risk.ts` (integration) | Synthetic seed → end-to-end snapshot fields populated correctly; idempotent re-run produces identical drivers; v1 → v2 cohort transition |
| `src/app/api/companies/[id]/risk/route.ts` | Schema-conformance against §7 contract; null-handling for missing benchmark / missing prior snapshot |

CI surface: `npm test` (unit), `npm run typecheck` (`tsc --noEmit`), `npm run build` (Next.js integration smoke). All three must pass before push.

## 12. Implementation order (drives the plan)

1. **Schema migration + Prisma generate**
2. **`src/lib/case-types.ts`** + tests (foundation; nothing else compiles cleanly without it)
3. **`src/lib/jurisdiction.ts`** + tests
4. **`src/lib/risk.ts`** v2 extension + tests (preserves v1)
5. **`src/lib/drivers.ts`** + tests
6. **`src/lib/benchmarks.ts`** + tests
7. **`prisma/seed-sectors.csv`** (~50 demo-tier rows for the milestone; full Russell 1000 expansion is a follow-on data task, not blocking) + **`scripts/seed-sectors.ts`** + integration check
8. **`scripts/compute-risk.ts`** orchestration update + integration test
9. **`src/app/api/companies/[id]/risk/route.ts`** v2 contract + schema-conformance test
10. **`src/components/*` and `src/app/companies/[id]/page.tsx`, `src/app/page.tsx`** — UI updates
11. **`docs/methodology/risk-score-v2.md`** — methodology doc
12. **End-to-end smoke**: rerun seed → `npm run risk` → visit dashboard + a profile page → verify drivers, deltas, benchmark render

## 13. Risks

| Risk | Mitigation |
|---|---|
| FLP licensing not yet settled | Attribution baked in from day 1 (`sources` block, footer); separate ops track to settle commercial terms before paid launch |
| Sector mapping errors → wrong cohorts → wrong percentiles | Hand-curate Russell 1000; `sectorConfidence` + `sectorSource` columns let us audit and regenerate |
| v2 score discontinuity confuses users on launch day | Annotation in UI; methodology doc explains; `?version=v1` API param available |
| Cohort < 30 for niche sectors → null benchmarks | Documented; returned with `reason: "cohort_too_small"`; no silent fallback |
| NOS code list drift over time | Snapshot the JS-44 list in code, version it (`case-types.v1.ts`), pin historical scores to the version they were computed under |
| Drivers expose internal heuristics in evidence payload | Keep `evidence` payload structured + minimal; no internal IDs or PII; all values are scalars or short arrays |

## 14. Acceptance criteria

- [ ] `npm test` green (unit tests for all six new/modified `lib/*` modules)
- [ ] `npm run typecheck` clean (`tsc --noEmit`)
- [ ] `npm run build` green
- [ ] `npm run seed && npm run risk` end-to-end produces `RiskScore` rows with all v2 columns populated for at least 80% of seeded companies
- [ ] At least three demo companies show *meaningfully different* driver narratives in the UI
- [ ] Methodology doc committed at `docs/methodology/risk-score-v2.md`
- [ ] API response for at least one seeded company conforms to §7 contract (manual or automated check)
- [ ] **Strict monotonicity test green**: a company whose cases produce `momentum_boost = 0` AND `concentration_bonus = 0` AND `jurisdiction_multiplier = 1.0` (e.g. all cases in unknown courts with diffuse categories and no spike) scores **exactly** the same as v1. Documented and unit-tested.
- [ ] **Soft monotonicity check**: a company with only a default jurisdiction signal (federal district, multiplier 1.05) scores within +6 points of its v1 score, no negative drift. Documented.
