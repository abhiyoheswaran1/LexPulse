# Score v3 Backtest & Calibration — Design Spec

**Date:** 2026-05-08
**Status:** Approved (pre-implementation)
**Milestone:** Sub-project F — *Calibration & Backtest Harness*
**Endgame bias:** Sell to Tier 1 incumbent (Moody's / Verisk / RELX / S&P / MSCI)

## 1. Goal

Produce a defensible empirical answer to the question every Tier 1 acquirer will ask: **"Does the LexPulse risk score predict realized material litigation events?"**

Concretely: link our v3 scores to **SEC 8-K material-event disclosures** (the U.S. legal mechanism by which public companies announce material litigation outcomes), measure how well the score predicts forward 8-K disclosure rates, and publish the numbers in the methodology doc.

The output is a **methodology-grade calibration appendix**, suitable for actuarial / regulatory review, that turns the score from "interesting heuristic" into "calibrated signal."

### Non-goals

- **No re-training of score weights.** This milestone *measures* the existing v3 methodology; tuning happens in a separate methodology bump after the numbers are in.
- **No case-level linkage.** Linking specific 8-Ks to specific dockets requires NLP on 8-K item text and is a follow-on project.
- **No stock-price / market-impact analysis.** Requires paid market data; deferred.
- **No private-company calibration.** 8-Ks only exist for SEC-registered public companies. Private-company calibration would require a different ground-truth source (claims data, news, etc.) — separate sub-project.

## 2. The empirical claim we're trying to support or refute

> **Companies in higher LexPulse score bands disclose material-litigation events on 8-K at a higher rate than companies in lower bands, over a forward window of 30 / 90 / 180 days.**

If true, the score has predictive validity (modulo the public-company subset).
If false (or weak), we report it honestly, identify which components carry signal, and use that to inform the next methodology revision.

## 3. Architecture

```
┌──────────────────────┐
│ SEC EDGAR            │  free, no auth
│ - CIK lookup         │  https://www.sec.gov/files/company_tickers.json
│ - 8-K full archive   │  https://www.sec.gov/Archives/edgar/full-index/...
└──────────┬───────────┘
           │ scripts/fetch-edgar-filings.ts
           ▼
┌──────────────────────┐
│ Postgres             │
│ - Company.cik        │  (new column)
│ - SecEdgarFiling     │  (new table — 8-K filings keyed by accession #)
│ - MaterialEvent      │  (new table — extracted from 8-K item text)
└──────────┬───────────┘
           │ scripts/backtest.ts
           ▼
┌──────────────────────┐
│ /tmp/backtest.json   │  IC, lift-by-band, hit rates
│ → methodology doc    │  appendix
└──────────────────────┘
```

### Files added

- `prisma/migrations/<ts>_calibration/` — schema additions
- `scripts/fetch-edgar-filings.ts` — pull 8-Ks from EDGAR
- `scripts/extract-material-events.ts` — regex/keyword classifier on 8-K item text
- `scripts/backtest.ts` — historical replay + IC computation
- `src/lib/edgar.ts` — pure parsing helpers (testable)
- `src/lib/__tests__/edgar.test.ts`
- `docs/methodology/calibration-v3.md` — published methodology appendix

### Files modified

- `prisma/schema.prisma` — add `Company.cik`, `SecEdgarFiling`, `MaterialEvent`
- `package.json` — `fetch:edgar`, `extract:material-events`, `backtest` scripts

## 4. Schema

```prisma
model Company {
  // ... existing
  cik           String?  @unique
  edgarFilings  SecEdgarFiling[]
}

model SecEdgarFiling {
  id              String          @id @default(cuid())
  companyId       String
  cik             String
  // SEC filing accession number, e.g. "0001628280-24-008534" — unique
  accession       String          @unique
  formType        String          // "8-K"
  filedAt         DateTime
  // 8-K items declared on the cover page, e.g. ["1.01", "8.01"]
  items           String[]
  // Public archive URL on sec.gov
  primaryDocUrl   String?
  // Raw text excerpt from the items most likely to contain material
  // events. Capped at ~10KB; we don't store full filings.
  itemTextExcerpt String?
  fetchedAt       DateTime        @default(now())

  company         Company         @relation(fields: [companyId], references: [id], onDelete: Cascade)
  events          MaterialEvent[]

  @@index([companyId, filedAt])
  @@map("sec_edgar_filings")
}

model MaterialEvent {
  id          String           @id @default(cuid())
  filingId    String
  // litigation_filed | settlement_disclosed | judgment_against |
  // judgment_for | dismissed | regulatory_inquiry | other_litigation
  eventType   String
  // Optional dollar amount if disclosed (best-effort regex extract).
  amountUsd   Decimal?         @db.Decimal(14, 2)
  // Confidence 0..1 from the classifier. Hand-rule classifier in v1
  // produces 0.5 (fired on a regex hit) or 0.9 (multiple signals).
  confidence  Float
  // Short snippet of the 8-K text that fired the classifier (for audit).
  snippet     String

  filing      SecEdgarFiling   @relation(fields: [filingId], references: [id], onDelete: Cascade)

  @@map("material_events")
}
```

Migration is additive and back-compat with existing v3 snapshots.

## 5. EDGAR fetcher

`scripts/fetch-edgar-filings.ts`

### Inputs
- The set of companies in our DB with a resolved CIK
- A start date (default: 2 years ago)
- A rate-limited (10 req/s) HTTP client per SEC's stated guideline

### Operations

1. **CIK linkage pass**: download `https://www.sec.gov/files/company_tickers.json` (free, no auth). For each company in our DB:
   - If `Company.ticker` matches a CIK ticker → set `Company.cik`
   - Otherwise: name fuzzy match against the JSON (CIK file has a normalized "title" field). Reuse our existing entity-resolution `normKey` for the match.
   - Skip if no match (private company, foreign entity, etc.).

2. **Filings pull**: for each company with a CIK:
   - Hit `https://data.sec.gov/submissions/CIK<10-digit-cik>.json` — gets recent 8-K accession numbers.
   - For each 8-K accession in the trailing 24 months:
     - If already in `SecEdgarFiling`, skip (idempotent).
     - Fetch the filing's primary document via `https://www.sec.gov/Archives/edgar/data/<cik>/<accession-clean>/<filename>`
     - Extract the items declared (already in the submissions JSON; no parsing needed).
     - Pull a text excerpt from the most-likely-litigation items (8.01, 1.01, 1.02, 5.02, 5.03 — see SEC Form 8-K instructions).
     - Insert `SecEdgarFiling` row.

### Headers (per SEC requirements)
- `User-Agent: LexPulse research@<contact-email>` (REQUIRED by SEC; without it requests fail)
- 10 req/s self-rate-limit

## 6. Material event classifier

`scripts/extract-material-events.ts`

For v1, a **deterministic keyword + regex classifier** running over each filing's `itemTextExcerpt`:

| `eventType` | Fires when item text matches |
|---|---|
| `litigation_filed` | "filed a lawsuit" / "complaint was filed" / "putative class action" / "filed against the Company" |
| `settlement_disclosed` | "agreed to settle" / "settlement agreement" / "without admission of liability" |
| `judgment_against` | "judgment was entered" / "verdict against" / "ordered to pay" |
| `judgment_for` | "ruled in favor" / "summary judgment for" / "dismissed with prejudice" |
| `dismissed` | "case was dismissed" / "claims were dismissed" / "motion to dismiss was granted" |
| `regulatory_inquiry` | "received a subpoena" / "civil investigative demand" / "Wells notice" |
| `other_litigation` | catchall for litigation-related items that don't fire the above |

Amounts: `\$\s?[0-9,]+(?:\.[0-9]+)?(?:\s?(million|billion|m|b))?` — best-effort, normalize to USD.

**Why deterministic, not LLM:** acquirer audit defensibility. Same input → same classification. Repeatable. The whole point of this milestone is methodology rigor — we can't have an LLM-generated label changing between runs.

A v2 could layer an LLM classifier on top with a confidence floor, but v1 is regex-only.

## 7. Backtest harness

`scripts/backtest.ts`

### Walk-forward methodology

For each historical anchor date `D` in the trailing 24 months (sampled monthly, 24 anchor dates total):

1. **Score as-of D** — for each company, recompute v3 using only cases with `dateFiled <= D` and judge profiles built from cases terminated `<= D`. (This requires a "score-at-time" mode for `computeRiskV3`, which the existing function already supports via the `now` parameter.)
2. **Forward window event detection** — for each company at anchor D, look forward at `MaterialEvent` rows whose parent filing has `filedAt > D AND filedAt <= D + window`. Record yes/no, count, and total amount disclosed.
3. **Persist**: `BacktestObservation { anchorDate, companyId, scoreAtAnchor, band, hadEvent30, hadEvent90, hadEvent180, eventCount90, totalAmountUsd90 }`. New table; ephemeral, can be wiped between backtest runs.

### Output statistics

For each forward window {30, 90, 180}:

1. **Hit rate by band** — P(event in window | company is in band X). Tables for low / moderate / elevated / high.
2. **Lift over base rate** — hit rate by band ÷ overall base rate. If high-band lift >> 1.0, the score sorts. If ~1.0, no signal.
3. **Information coefficient (IC)** — Spearman rank correlation between `scoreAtAnchor` and a binary `hadEventX`. Reported per anchor date (as a time series) and as the mean/std across all anchors.
4. **Decile lift curve** — sort companies into deciles by score, plot event rate per decile. A monotonic curve = clean signal; a flat curve = score doesn't sort.

### Output format

`/tmp/backtest-output.json` — machine-readable.
`docs/methodology/calibration-v3.md` — human-readable with embedded tables (markdown), Sharpe-style summary, limitations section.

## 8. Implementation order

1. **Schema migration** — `Company.cik`, `SecEdgarFiling`, `MaterialEvent`. (1 day)
2. **EDGAR fetcher**:
   - CIK linkage from company_tickers.json — fast, in-memory match. (1 day)
   - 8-K submissions fetcher with rate limit + idempotent insert. (2 days)
   - Item-text excerpt parsing (HTML → plain text). (1 day)
3. **Material event classifier** — regex/keyword, deterministic, well-tested. (2 days)
4. **Backtest harness**:
   - "Score-at-time" mode (already supported by `computeRiskV3` via `now` param). (0.5 day)
   - Walk-forward replay loop with persistence. (2 days)
   - Stats computation + output. (1 day)
5. **Methodology doc** — Calibration appendix with tables, IC, lift, limitations. (2 days)
6. **End-to-end smoke** — run on production DB, sanity-check numbers. (1 day)

**Total: ~13 working days = ~3 weeks.**

## 9. Acceptance criteria

- [ ] EDGAR fetcher pulls 8-Ks for ≥ 80% of public-company candidates in our DB (i.e., companies whose name fuzzy-matches a CIK)
- [ ] Material event classifier achieves ≥ 70% precision on a hand-labeled 50-event eval set (built during this milestone)
- [ ] Backtest produces reproducible IC numbers (deterministic on fixed input data)
- [ ] Methodology doc has tables for: hit rate by band × window, lift over baseline, IC mean/std, decile event-rate curve
- [ ] Limitations section names: public-company-only subset, regex classifier precision, sample-size caveats per band
- [ ] All 71+ existing tests still green
- [ ] No regression on existing risk computation (v3 scores match pre-milestone for unchanged inputs)

## 10. What "good" looks like

For an acquirer reading the methodology doc, the bar is roughly:

- **Hit rate "high" band, 90-day window: 15–25%** (vs base rate ~3–5%) — solid signal
- **IC mean across anchors: 0.10–0.20** — decent for a heuristic with no ML
- **Decile event-rate curve: monotonic** — score actually sorts
- **All this on a public-company subset of 200–500 companies** — small but defensible

If we hit those numbers, we have a sellable signal. If we don't, we have a roadmap for v4 — likely re-weighting severity, or adding outcome-conditional severity (some case types matter more in 8-K disclosure than others).

## 11. Risks

| Risk | Mitigation |
|---|---|
| CIK linkage rate < 30% | Use OpenCorporates as fallback; manual mapping for top 100 |
| 8-K text varies wildly across companies — regex misses | Hand-label 50-event eval set; report classifier precision honestly |
| Score has weak predictive validity | Report it. Iterate methodology in v3.1 with calibration insight |
| SEC rate-limit changes mid-fetch | 10 req/s self-limit; idempotent fetch resumes cleanly |
| Sample size too small per band for high-IC claim | Report wide confidence intervals; defer the "calibrated" framing if so |
| 8-K classifier produces too many false positives | Hand-label eval set; tune regex; document precision number publicly |

## 12. What we don't promise

- **Causal inference.** The score correlates with 8-K events; it doesn't claim those events were *caused* by the cases the score is computed from.
- **Generalization to private companies.** Public-only calibration. Documented.
- **Predictive accuracy on rare events.** "High" band has only ~7 companies right now; statistical power is weak. We report the numbers we have; we don't extrapolate.
- **Forward-looking guarantees.** Past hit rates are not future hit rates. The methodology doc says this in plain English.
