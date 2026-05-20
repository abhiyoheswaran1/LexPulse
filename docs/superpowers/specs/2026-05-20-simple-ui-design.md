# Simple UI Design Spec

**Date:** 2026-05-20
**Status:** Approved for implementation
**Scope:** Whole-product Simple mode, while preserving the existing UI as the default Advanced experience.

## Goal

Add a simplified LexPulse interface for investors and executives who monitor a company portfolio and need to know what deserves attention. The current UI remains the default and becomes the Advanced interface. Users can switch between Simple and Advanced without losing access to existing tables, calibration, API docs, company details, or source links.

## Product Positioning

Simple mode is not a side-by-side comparison and not a visual demo. It is a real alternate interface in the product.

- Default experience: existing Advanced UI at the current routes.
- Optional experience: Simple mode under `/simple`.
- Primary Simple audience: investors and executives.
- Primary Simple job: portfolio monitoring.
- Primary question: "What needs review?"

## Information Architecture

Existing routes stay in place:

- `/`
- `/search`
- `/alerts`
- `/companies/[id]`
- `/calibration`
- `/api`

New Simple routes:

- `/simple`: portfolio monitor with `Queue` and `Map` views.
- `/simple/search`: simplified company search.
- `/simple/alerts`: simplified alert review.
- `/simple/companies/[id]`: simplified company brief.

Switching rules:

- Advanced chrome includes a visible `Simple` entry and a top-bar Simple mode link.
- Simple chrome includes a visible `Advanced` link back to the current UI.
- Simple company briefs include an `Advanced profile` link to `/companies/[id]`.
- Advanced company profiles include a `Simple brief` link to `/simple/companies/[id]`.

## Simple Dashboard

`/simple` opens on the Queue view.

Queue view:

- Top summary: Review now, Monitor, Quiet.
- Priority queue: ranked companies with status, score, short reason, sector, and one clear next action.
- Compact sector concentration panel, with a link to the full Map view.

Map view:

- First-class sibling view, not an afterthought.
- Sector cards summarize review, monitor, and quiet counts.
- Each sector card links back to the queue filtered by sector when practical.

## Simple Company Brief

`/simple/companies/[id]` should answer in one screen:

- Current risk status.
- Why it matters now.
- What changed recently.
- How it compares with sector peers when benchmark data exists.
- The most useful source links and recent cases.
- Link to the Advanced profile.

The page should avoid exposing all factor math by default, but it should never hide source attribution or advanced access.

## Simple Search

`/simple/search` uses plain-language result rows:

- Company name.
- Risk score and status.
- Case count.
- Simple status label.
- Link to the Simple company brief.
- Link or control to Advanced search is visible.

## Simple Alerts

`/simple/alerts` groups alerts by investor impact:

- Review now.
- Monitor.
- Informational.

Rows use plain-language titles and the company name. Each row links to the Simple company brief, with source detail available through the Advanced profile.

## Visual Direction

The current Advanced UI keeps the existing dark editorial, Bloomberg-terminal-adjacent visual system.

Simple mode uses a quieter light workspace:

- Warm paper background.
- Dark ink text.
- Muted amber accent.
- Semantic red, amber, and green for review status.
- Familiar product controls, no decorative side-by-side comparison.

The Simple UI should feel like a portfolio brief, not a marketing landing page. It should reduce reading load without becoming vague.

## Data Model and Ranking

Simple mode derives user-facing statuses from existing score snapshots and drivers.

Status rules:

- `review`: high band, score at or above 80, material positive 7-day delta, severe filing, risk jump, or case spike.
- `monitor`: elevated or moderate score, recent cases, or some risk signal but no immediate review trigger.
- `quiet`: low score with no recent activity and no urgent driver.

Reason text should be deterministic and based on score, band, deltas, recent cases, drivers, sector benchmarks, and case counts. No LLM copy generation is introduced.

## Testing

Add focused unit tests for Simple-mode classification and reason generation. Existing app tests must continue passing. Run:

- `npm test`
- `npm run typecheck`
- `npm run build`

Browser verification should cover:

- `/` remains the Advanced dashboard.
- `/simple` renders the Simple monitor.
- `/simple?view=map` renders the Map view.
- `/simple/search` renders the Simple search flow.
- `/simple/alerts` renders the Simple alert flow.
- `/simple/companies/[id]` renders a Simple company brief for a real company link from the app.

## Non-Goals

- Do not remove the current UI.
- Do not replace the Advanced dashboard as the default route.
- Do not ship a side-by-side preview in the product.
- Do not introduce authentication, saved watchlists, or per-user preferences in this pass.
- Do not add generated AI explanations.
