# Epic 1 Product Workflow Design

**Date:** 2026-05-21
**Decision:** Ship the product workflow foundation without auth, billing, email, or Slack dependencies.

## Goal

Make LexPulse useful as a daily litigation workflow tool before adding SaaS infrastructure. Users should be able to track companies, save recurring searches, filter and triage alerts, understand score movement, inspect confidence, and read a plain methodology page.

## Scope

Included:

- Watchlist: browser-local selected companies.
- Saved searches: browser-local saved search terms.
- Alert read/unread state: browser-local alert IDs.
- Alert filters: impact, sector, company, type, and read state.
- Score history chart on company profiles.
- "Why did this change?" timeline on company profiles.
- Better source links from alerts and cases where source references exist.
- Investor-friendly methodology page.
- Confidence indicators for sector/entity matching on company profiles and watchlist rows.

Deferred:

- Auth, teams, billing, email, and Slack.
- Server-side per-user persistence.
- Database schema for user preferences.

## Architecture

Browser-local workflow state is stored under one versioned localStorage key. The pure state helpers live in `src/lib/workflow.ts` and are tested. Client workflow components read and write that state, while server routes continue to own canonical litigation data.

The existing `/api/companies` route gains an `ids` parameter so local watchlist IDs can be hydrated with current score, case count, sector, and confidence data.

The `/alerts` page remains server-fed, but renders a client workbench for filtering and local read/unread state. The company profile remains server-rendered, with small client components only for watchlist actions and history charts.

## UX

- Add Watchlist to the Analyst sidebar.
- Add watchlist controls on company profiles and search rows.
- Add saved-search controls to Search.
- Add filter controls to Alerts without replacing the dense alert feed.
- Add score history and change timeline above the case table on company profiles.
- Add Methodology as a product page and link it from navigation/API/calibration where useful.

## Data Rules

- Local watchlists store only company ID, name, ticker, and saved timestamp.
- Saved searches store query text and timestamp.
- Read alerts store alert IDs only.
- `Alert.refs` is parsed defensively for case IDs and source IDs.
- Score history uses existing `RiskScore` rows, ordered by `computedAt`.
- Driver history uses each historical score row's denormalized drivers.

## Verification

- Unit tests cover local workflow state parsing, toggling, saving, deduping, and alert read state.
- Run `npm test`, `npm run typecheck`, and `npm run build`.
- Browser-check `/`, `/watchlist`, `/search`, `/alerts`, `/companies/[id]`, `/methodology`, and `/settings`.
