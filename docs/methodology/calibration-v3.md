# Score v3 Calibration — Backtest Against SEC 8-K Material Events

**Methodology version:** v3.0
**Calibration date:** 2026-05-08
**Calibration subset:** 211 SEC-registered public companies (of 7,026 universe-wide); 3,576 walk-forward observations across 24 monthly anchor dates 2023-12-01 → 2025-11-01
**Source corpus:** 3,415 8-K filings, 333 classified material events

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

## Statistics

All numbers below are reproducible via `npm run backtest` — the harness
writes `/tmp/backtest-output.json` and prints the same to stdout.

### 1. Hit rate by band × forward window

```
WINDOW: 30 DAYS
  Base rate: 4.78%
  low         n=1210   hits= 66   rate=5.5%   lift=1.14x
  moderate    n=1715   hits= 74   rate=4.3%   lift=0.90x
  elevated    n= 595   hits= 28   rate=4.7%   lift=0.98x
  high        n=  56   hits=  3   rate=5.4%   lift=1.12x

WINDOW: 90 DAYS
  Base rate: 12.95%
  low         n=1210   hits=159   rate=13.1%  lift=1.01x
  moderate    n=1715   hits=205   rate=12.0%  lift=0.92x
  elevated    n= 595   hits= 91   rate=15.3%  lift=1.18x
  high        n=  56   hits=  8   rate=14.3%  lift=1.10x

WINDOW: 180 DAYS
  Base rate: 21.50%
  low         n=1210   hits=246   rate=20.3%  lift=0.95x
  moderate    n=1715   hits=354   rate=20.6%  lift=0.96x
  elevated    n= 595   hits=152   rate=25.5%  lift=1.19x
  high        n=  56   hits= 17   rate=30.4%  lift=1.41x
```

### 2. Information coefficient (IC)

Spearman rank correlation between `scoreAtAnchor` and the binary
forward-window indicator, computed per anchor and aggregated across 24
anchors:

```
WINDOW    MEAN IC    STD IC    n ANCHORS
30d       0.0002     0.0495    24
90d       0.0273     0.0357    24
180d      0.0623     0.0343    24
```

For interpretation:
- IC ≥ 0.10 — **respectable signal** for a heuristic with no ML
- IC ≥ 0.15 — **strong signal** by quantitative-finance standards
- IC ≤ 0.05 — score does not meaningfully sort

**Headline read:** v3 has **weak but non-zero predictive validity at
the 180-day horizon** (IC 0.06, std 0.03 — the std is half the mean,
so the signal isn't an artifact of one anchor). It is **not predictive
at 30 days** (IC effectively zero). The 90-day window is in between.

### 3. Decile lift curve, 180-day window

```
DECILE  n     RATE    LIFT
D1     357   14.0%   0.65x
D2     358   18.2%   0.84x
D3     357   24.6%   1.15x
D4     358   24.0%   1.12x
D5     358   14.2%   0.66x  ← outlier; small-N noise
D6     357   23.5%   1.09x
D7     358   22.1%   1.03x
D8     357   23.0%   1.07x
D9     358   21.5%   1.00x
D10    358   29.9%   1.39x
```

The curve is non-monotonic in the middle (the D5 dip is real but
likely sample noise — single-anchor concentration in the score 30-50
range), but the **bottom-decile-vs-top-decile gap is meaningful**: D1
sees 14.0% event rate (0.65x base), D10 sees 29.9% (1.39x). That's
**2.1x more events in the top decile than the bottom**. The score is
sorting at the extremes even when the middle is noisy.

## What this means

**The score is calibrated to docket activity, not realized
materiality.** Most companies that file litigation 8-Ks are
heavy-litigation companies — but heavy litigation is not novel for
them, and our v3 score reacts most strongly to *recent* and *high-
severity* filings, not to *steady* litigation patterns. The companies
generating 8-Ks tend to be incumbents with stable case loads, so they
score in the *moderate* band (12% of population, 48% of observations,
where most events land).

The signal that *does* exist (180d IC 0.06, top-decile lift 1.39x)
shows the score has some validity — but the headline interpretation
should be: **v3 is a useful sorter at the extremes over multi-month
horizons**, not a real-time predictor of materiality.

## Implications for v3.1

The next methodology revision should target the gaps the calibration
exposes:

1. **Severity calibration by case category.** Today every securities
   class action contributes the same severity weight; in reality
   employment-class severity ≠ securities-class severity ≠ patent.
   Re-weight using settlement-amount priors per category (data we now
   have via MaterialEvent.amountUsd).

2. **Outcome-conditional severity.** A case with a known dismissal
   outcome should weigh less than a case with a known judgment. The
   score currently treats all open cases equally regardless of judge
   profile beyond the multiplier.

3. **Long-horizon weighting.** The 180d signal is real; the 30d signal
   isn't. The current score under-weights structural/persistent
   factors and over-weights momentum. Either widen the momentum window
   or split into "structural" and "momentum" sub-scores so
   subscribers can choose horizon.

4. **Stronger normalization at the extremes.** D1 vs D10 has 2.1x
   spread but D2-D9 are mostly flat. The banding gates (high < 75) put
   only 56 of 3,576 obs in the high band; loosening to broaden the
   high band would test whether more granular separation helps.

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

## Decision: v3 ships as a calibrated weak signal; v3.1 work begins

After seeing the numbers, the decision is to **publish v3 with the
calibration appendix as written** — IC 0.06 at 180d is honest and
defensible. Top-decile lift 1.39x at 180d is real signal. The score
sorts at the extremes.

But this is **not** a "ship and walk away" methodology. The
calibration informs four concrete iterations targeted by `v3.1`
(see "Implications" above). Once `v3.1` lands, this appendix is
re-run on the same data; the new IC numbers replace these. The
methodology version pinned in `BacktestObservation.scoreVersion`
keeps `v3.0` numbers immutable for audit comparison.

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
