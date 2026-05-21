# LexPulse Data Platform Foundation Design

## Goal

Expand LexPulse from a docket-derived company list into a canonical data platform for US public-company litigation intelligence, with reliable refreshes, entity-match confidence, source coverage, and first-pass outcome/materiality extraction.

## Scope

This epic focuses on free and official sources:

- SEC exchange-listed company universe from `company_tickers_exchange.json`.
- Optional Russell 3000 and S&P 1500 import files, treated as user-supplied universe tags because official index membership is not consistently free to redistribute.
- CourtListener federal civil dockets, parties, and docket entries where available.
- SEC litigation releases and EDGAR filings.
- CFPB enforcement action pages.

Out of scope for this epic: paid PACER crawling, proprietary index membership feeds, state courts, arbitration, and commercial market-data providers.

## Why Refresh Is Stale

The app recomputes risk nightly, but the weekly CourtListener source-data ingest has been timing out during the fetch step. That leaves `risk_scores` fresh while `cases` are stale. The fix is to move from one long weekly job to shorter, checkpointed source jobs plus visible ingest-run telemetry.

## Data Model

`CompanyMaster` becomes the canonical entity users care about. Existing `Company` rows remain as observed/resolved entities for compatibility while the product migrates.

- `CompanyMaster`: canonical company name, normalized key, ticker, CIK, exchange, SIC, sector, universe tags.
- `CompanyAlias`: alternative names for matching, with source and confidence.
- `ObservedParty`: raw party strings observed in CourtListener data.
- `EntityMatch`: auditable observed-party-to-master match, including score, method, and review state.
- `DataIngestRun`: source job status, checkpoint, counts, errors.
- `ExternalEvent`: regulator/SEC/CFPB events tied to a company when possible.
- `CaseOutcome`: deterministic extracted outcomes from docket entries, case status, or external event text.

## Entity Resolution

Resolution uses deterministic scoring first:

- exact normalized alias: high confidence
- ticker or CIK match: high confidence
- prefix/subsidiary phrase match: medium confidence
- weak fuzzy overlap: low confidence, not automatically trusted

Ambiguous matches are stored, not silently merged. Any match below the auto-accept threshold remains reviewable.

## Refresh Strategy

- Daily incremental CourtListener API job with date windows, term sharding, and `DataIngestRun` checkpoints.
- Weekly party enrichment job for cases missing observed-party records.
- Quarterly bulk refresh aligned to CourtListener bulk snapshots.
- Nightly risk recompute stays separate.
- Calibration job must skip cleanly when `EDGAR_USER_AGENT` is absent or fail with clear status.

## Coverage UI

Coverage becomes a first-class product surface:

- master companies by universe
- SEC-listed, S&P import, Russell import counts
- observed parties, matched parties, unresolved parties
- match-confidence bands
- source freshness by CourtListener, SEC, CFPB
- outcome/materiality counts
- recent ingest failures

## Source Expansion

Easy/free sources now:

- SEC EDGAR company universe and filings APIs.
- SEC litigation releases page/RSS.
- CFPB enforcement actions pages.

Deferred:

- FTC/DOJ press releases, because the first pass would be noisier text matching.
- State court data, because availability and normalization vary sharply by jurisdiction.
- Paid PACER/commercial sources.

## Testing

Unit tests cover:

- SEC company ticker exchange parsing.
- alias generation and canonical normalization.
- entity match scoring and ambiguity handling.
- outcome/materiality text classification.
- coverage-metric calculations.

E2E smoke coverage checks the coverage/status surface after implementation.
