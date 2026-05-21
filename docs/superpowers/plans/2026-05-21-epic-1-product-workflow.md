# Epic 1 Product Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser-local workflow features that make LexPulse useful daily before auth and billing.

**Architecture:** Keep canonical litigation data server-side. Store no-auth user workflow state in versioned localStorage, hydrate watchlists through `/api/companies?ids=...`, and render alert filters/read state in a client workbench.

**Tech Stack:** Next.js App Router, React client components, Prisma, Vitest, Tailwind CSS.

---

### Task 1: Workflow State Helpers

**Files:**
- Create: `src/lib/workflow.ts`
- Create: `src/lib/__tests__/workflow.test.ts`

- [x] Write failing tests for state parsing, watchlist toggling, saved search dedupe, and alert read/unread.
- [x] Run `npm test -- src/lib/__tests__/workflow.test.ts` and confirm it fails because helpers do not exist.
- [x] Implement pure helpers in `src/lib/workflow.ts`.
- [x] Re-run the focused test and confirm it passes.

### Task 2: Watchlist And Saved Searches

**Files:**
- Create: `src/components/workflow/WatchlistButton.tsx`
- Create: `src/app/watchlist/page.tsx`
- Modify: `src/app/api/companies/route.ts`
- Modify: `src/app/search/page.tsx`
- Modify: `src/app/companies/[id]/page.tsx`
- Modify: `src/components/AppChrome.tsx`

- [x] Add local watchlist toggle buttons on search rows and company profiles.
- [x] Add `/watchlist` with hydrated current score rows and confidence indicators.
- [x] Add saved search controls to `/search`.
- [x] Add Watchlist to Analyst navigation.

### Task 3: Alert Workbench

**Files:**
- Create: `src/components/workflow/AlertsWorkbench.tsx`
- Modify: `src/app/alerts/page.tsx`

- [x] Fetch sector labels for alert companies.
- [x] Render filters for impact, sector, company, type, and read state.
- [x] Persist read/unread alert IDs locally.
- [x] Preserve source/detail links to company profiles.

### Task 4: Company Trust Panels

**Files:**
- Create: `src/components/ScoreHistoryChart.tsx`
- Modify: `src/app/companies/[id]/page.tsx`

- [x] Query score history on company profile.
- [x] Render score history chart.
- [x] Render "Why did this change?" timeline from score deltas and drivers.
- [x] Render sector/entity confidence indicators.
- [x] Improve recent alert source links where refs are available.

### Task 5: Methodology

**Files:**
- Create: `src/app/methodology/page.tsx`
- Modify: `src/components/AppChrome.tsx`
- Modify: `src/app/api/page.tsx`

- [x] Add investor-readable methodology page.
- [x] Link it from navigation and API page.

### Task 6: Verification And Deployment

- [x] Run `npm test`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Browser-check core routes.
- [ ] Commit, push, deploy production, and verify live routes.
