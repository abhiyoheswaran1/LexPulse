# Data Platform Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first canonical-company and data-quality foundation for LexPulse while keeping the current app working.

**Architecture:** Add a canonical master-company layer beside the existing `Company` table, then populate observed-party, match, ingest-run, external-event, and outcome tables through focused scripts. Coverage/status APIs and UI read aggregate metrics from these tables so users can see freshness and confidence.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/Postgres, Vitest, Playwright, GitHub Actions, official/free SEC/CourtListener/CFPB sources.

---

### Task 1: Core Data Helpers

**Files:**
- Create: `src/lib/company-master.ts`
- Create: `src/lib/entity-resolution.ts`
- Create: `src/lib/outcomes.ts`
- Create: `src/lib/coverage.ts`
- Test: `src/lib/__tests__/company-master.test.ts`
- Test: `src/lib/__tests__/entity-resolution.test.ts`
- Test: `src/lib/__tests__/outcomes.test.ts`
- Test: `src/lib/__tests__/coverage.test.ts`

- [ ] Write failing tests for SEC exchange JSON parsing, alias creation, match scoring, outcome classification, and coverage aggregation.
- [ ] Implement the smallest helpers that satisfy the tests.
- [ ] Run targeted tests, then the full Vitest suite.

### Task 2: Prisma Schema And Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260521210000_data_platform_foundation/migration.sql`

- [ ] Add `CompanyMaster`, `CompanyAlias`, `ObservedParty`, `EntityMatch`, `DataIngestRun`, `ExternalEvent`, and `CaseOutcome`.
- [ ] Link new models to existing `Company` and `Case` where useful without breaking current queries.
- [ ] Run `npx prisma generate`.

### Task 3: Import And Matching Scripts

**Files:**
- Create: `scripts/import-company-master.ts`
- Create: `scripts/match-observed-parties.ts`
- Create: `scripts/fetch-courtlistener-parties.ts`
- Modify: `package.json`

- [ ] Import SEC exchange-listed companies from the official JSON endpoint.
- [ ] Import optional Russell/S&P CSV tags from a local path.
- [ ] Backfill observed parties from existing `company_case_link` rows.
- [ ] Create entity matches against `CompanyMaster` with score and review status.
- [ ] Add a CourtListener party enrichment script for cases missing observed parties.

### Task 4: External Events And Outcomes

**Files:**
- Create: `scripts/fetch-external-events.ts`
- Create: `scripts/extract-case-outcomes.ts`
- Modify: `package.json`

- [ ] Fetch SEC litigation releases and CFPB enforcement actions as source-linked external events.
- [ ] Match events to companies when deterministic aliases are present.
- [ ] Extract first-pass case outcomes from external event text and case termination data.

### Task 5: Coverage API And UI

**Files:**
- Create: `src/app/api/coverage/route.ts`
- Create: `src/app/coverage/page.tsx`
- Modify: `src/lib/status.ts`
- Modify: `src/app/status/page.tsx`
- Modify: `src/components/AppChrome.tsx`

- [ ] Expose coverage metrics via API.
- [ ] Add a coverage page with master-company, match-confidence, source-freshness, and outcome sections.
- [ ] Include key coverage cards on the existing status page.

### Task 6: Workflow Reliability

**Files:**
- Modify: `.github/workflows/ingest.yml`
- Modify: `.github/workflows/calibration.yml`
- Create: `.github/workflows/data-refresh.yml`

- [ ] Add shorter daily refresh jobs for SEC company master, CourtListener incremental fetch, party enrichment, matching, external events, and outcomes.
- [ ] Keep weekly bulk/large ingest as a separate longer-running job.
- [ ] Make missing EDGAR user-agent explicit in calibration logs.

### Task 7: Verification And Release

**Files:**
- Modify: `README.md`
- Modify: `tests/e2e/platform.spec.ts`

- [ ] Document the data coverage model and refresh jobs.
- [ ] Add e2e smoke coverage for `/coverage`.
- [ ] Run typecheck, unit tests, build, e2e.
- [ ] Apply migration, commit, push, deploy, and verify production routes.
