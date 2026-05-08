# Score v3 Calibration — Backtest Against SEC 8-K Material Events

**Methodology version:** v3.0
**Calibration date:** _to be filled by `npm run backtest`_
**Calibration subset:** SEC-registered public companies in the LexPulse universe

---

## Overview

This appendix calibrates the LexPulse v3 risk score against a defensible
external ground truth: **material litigation events disclosed on SEC Form
8-K**. For each historical anchor date, we compute the v3 score as it
would have been at that point in time, then look forward to whether the
company filed a material-event 8-K within 30, 90, and 180 days.

The output is reproducible empirical evidence that the score sorts
companies by realized litigation outcomes — not just by docket activity.

## Why 8-K disclosures

Form 8-K is the SEC's mechanism for material-event disclosure. Public
companies are required to file an 8-K within four business days when a
material event occurs (defined by what a reasonable investor would
consider important). For litigation, this typically captures:

- Filing of a class action or significant lawsuit
- Settlements (especially with disclosed dollar amounts)
- Adverse or favorable judgments
- Regulatory investigations / Wells notices / subpoenas
- Dismissals of material cases

8-Ks are imperfect ground truth. Materiality is judged by the company,
not us, and the threshold varies by company size. But they are
**the strongest free signal of realized litigation outcomes** available
for public companies, and unlike news scrapes they are auditable,
date-stamped, and legally binding.

## Pipeline

```
EDGAR (free, public)              LexPulse DB
─────────────────────             ─────────────
company_tickers.json   ─→ CIK linkage ─→ Company.cik (225 of 7,026)
data.sec.gov/submissions  ─→ 8-K filings   ─→ SecEdgarFiling
EDGAR Archives          ─→ filing text   ─→ itemTextExcerpt
                          regex classify ─→ MaterialEvent
                          walk-forward   ─→ BacktestObservation
                          stats          ─→ this doc
```

### CIK linkage

We download SEC's `company_tickers.json` (~12K SEC-registered companies)
and match to our universe using the same `normKey` we use for entity
resolution (lowercase, punctuation-stripped, corp-suffix-removed). Of
**7,026 LexPulse-tracked companies**, **225 (3.2%)** are SEC-registered
public companies with at least one 8-K filing in the trailing 24
months. This is our calibration subset.

The other 96.8% are private companies, foreign entities, special-purpose
LLCs, and shell entities — for which 8-K calibration is impossible by
construction. They benefit from the calibrated score (same methodology
applied to similar case patterns), but their score is not directly
validated by this exercise.

### Material event classifier

Filings undergo a deterministic regex/keyword classifier (no LLM, no
ML) to extract event type:

| Event type             | Trigger phrasings (sample)                     |
|------------------------|------------------------------------------------|
| `litigation_filed`     | "filed a lawsuit", "putative class action"     |
| `settlement_disclosed` | "agreed to settle", "settlement agreement"     |
| `judgment_against`     | "judgment was entered against", "ordered to pay" |
| `judgment_for`         | "ruled in favor of the Company"                |
| `dismissed`            | "case was dismissed", "motion to dismiss granted" |
| `regulatory_inquiry`   | "Wells notice", "civil investigative demand"   |
| `other_litigation`     | catchall for litigation-relevant text          |

**Why deterministic.** Acquirer audit defensibility. Same input → same
classification, no model drift between runs, no hidden hyperparameters.
A future v2 may layer ML on top with a confidence floor; v1 is regex.

**Confidence:** `0.5` for a single matching pattern, `0.9` for two or
more co-occurring patterns of the same event type. Filings can fire
multiple distinct event types (e.g., a complaint filing AND a
settlement disclosure for two separate matters in one 8-K).

**Dollar amounts:** the largest matching dollar figure within the
classifier's snippet window (~200 chars around the firing phrase) is
captured. We pick the largest as a heuristic against headline-vs-fee
confusion ("$5,000 court fee" vs "$50 million in damages"). Stored as
`amountUsd` on `MaterialEvent`.

### Walk-forward backtest

For each of the last **24 monthly anchor dates** (skipping the most
recent 180 days to ensure complete forward windows):

1. **Score-at-time**: For each company, build the case set
   `dateFiled <= anchor` and judge profiles from cases
   `dateTerminated <= anchor`. Compute v3 score with `now=anchor`.
2. **Forward-window event detection**: query 8-K filings with
   `filedAt > anchor AND filedAt <= anchor+window` that have at
   least one classified MaterialEvent.
3. **Persist** as `BacktestObservation` (one row per anchor × company).

Idempotent: rerunning the harness wipes existing observations for that
score version + anchor and re-creates them.

## Statistics published

> _Tables in this section are filled in by `npm run backtest`. The
> harness writes `/tmp/backtest-output.json` and prints the same to
> stdout._

### 1. Hit rate by band × forward window

For each forward window, we report:
- **Base rate** — fraction of *all* observations that had any event.
- **Per-band hit rate** — `P(event in window | band X)`.
- **Lift** — band hit rate ÷ base rate. `1.0 ` is no signal; `>1.5` is
  meaningful sorting power; `>2.5` is strong.

```
WINDOW: 30 DAYS
  Base rate:  __.__%
  low         n=____  hits=___  rate=__.__%  lift=_.__x
  moderate    n=____  hits=___  rate=__.__%  lift=_.__x
  elevated    n=____  hits=___  rate=__.__%  lift=_.__x
  high        n=____  hits=___  rate=__.__%  lift=_.__x

WINDOW: 90 DAYS
  Base rate:  __.__%
  ...

WINDOW: 180 DAYS
  Base rate:  __.__%
  ...
```

### 2. Information coefficient (IC)

Spearman rank correlation between `scoreAtAnchor` and the binary
forward-window indicator, computed per anchor and aggregated:

```
WINDOW    MEAN IC    STD IC    n ANCHORS
30d       _.____     _.____    24
90d       _.____     _.____    24
180d      _.____     _.____    24
```

For interpretation:
- IC ≥ 0.10 — **respectable signal** for a heuristic with no ML
- IC ≥ 0.15 — **strong signal** by quantitative-finance standards
- IC ≤ 0.05 — score does not meaningfully sort

### 3. Decile lift curve

Companies are sorted into score deciles. We report event rate per
decile. A monotonically-increasing curve = clean signal; a flat curve
= the score doesn't sort.

```
DECILE   90d EVENT RATE   LIFT
1 (low)  __.__%           _.__x
2        __.__%           _.__x
...
10 (high) __.__%          _.__x
```

## Limitations

### 1. Public-company subset
8-Ks only exist for SEC-registered public companies. Of our universe of
~7,026, only **225 (3.2%)** are calibrated against. The other 96.8%
benefit from the same methodology but are not directly validated.
Calibrating private-company scores would require a different ground
truth source (insurance claim data, news/adverse-media APIs) — out of
scope for this milestone.

### 2. Materiality is company-judgment
Whether an event triggers an 8-K is the **company's** materiality call,
not ours. Larger companies have higher materiality thresholds. A $5M
settlement might be a non-event for Apple but material for a small-cap
biotech. This is a **noise floor on hit rates**, especially at the low
end.

### 3. Classifier precision
The regex classifier is conservative (low false positive rate) but
**will miss filings written in unusual phrasings**. A dedicated eval
set of 50 hand-labeled filings is the planned mechanism for publishing
a precision number. We accept some false-negative rate as the cost of
deterministic auditability.

### 4. Sample size per band
The `high` band today has only ~7 companies in our public subset.
Statistical confidence intervals at this band are wide. We report the
numbers we have; we do not extrapolate.

### 5. No causal claim
The score correlates with 8-K events. It does **not** claim those events
were caused by the dockets the score is computed from. Some 8-Ks are for
litigation we don't ingest (state court, regulatory). The signal is
*predictive correlation*, not causation.

### 6. Past hit rate is not a forward guarantee
Calibration holds against the historical distribution. Future
predictive validity depends on continued similarity in the kinds of
cases that drive 8-K disclosures. Methodology bumps may shift this.

## Reproducibility

```bash
# 1. Pull SEC data (public, free)
npm run fetch:edgar -- --link --filings

# 2. Run classifier
npm run extract:material-events

# 3. Walk-forward backtest, write /tmp/backtest-output.json
npm run backtest

# 4. Validate: every observation can be re-derived from the inputs
#    above + git SHA of methodology code
```

Methodology version `v3.0` is pinned by the `scoreVersion` field on
`BacktestObservation`. A future `v3.1` re-tuning will create new
observations under that version label, leaving `v3.0` immutable.

## What we change after seeing the numbers

If IC is **strong** (mean ≥ 0.10 for 90d): publish the methodology with
limitations as written. The score is a calibrated signal.

If IC is **moderate** (0.05–0.10): identify which score components
correlate most strongly. Iterate `v3.1` — likely re-weighting severity
or adding outcome-conditional severity (some case types matter more
for 8-K disclosures than others).

If IC is **weak** (≤ 0.05): document honestly. The current methodology
is a heuristic over docket activity; we'd need outcome data (settlement
amounts, judgments) extracted from court opinions to do better. That's
the v4 roadmap.

## Glossary

- **CIK** — Central Index Key, the SEC's per-registrant primary key.
- **8-K** — Material event disclosure form. Filed within 4 business
  days of triggering events.
- **Anchor date** — A historical "as-of" date used by the walk-forward
  harness to compute scores using only data known at that time.
- **Information coefficient (IC)** — Spearman rank correlation between
  a signal and forward returns. Standard quant-finance metric.
- **Lift** — Hit rate of a bucket divided by overall base rate. `2.0x`
  means the bucket has twice the event rate of average.
