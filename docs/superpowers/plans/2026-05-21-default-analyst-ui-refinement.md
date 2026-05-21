# Default Analyst UI Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the current Analyst UI as default, move workspace switching to Settings, rename the alternate workspace to Brief, and bring Brief's useful triage signals into the Analyst flow.

**Architecture:** Keep existing route families stable. Add `/settings` for workspace selection. Reuse `src/lib/simple-ui.ts` attention helpers across Analyst and Brief pages so both interfaces use the same Review / Monitor / Quiet language.

**Tech Stack:** Next.js App Router, React Server Components, Prisma, Vitest, Tailwind CSS.

---

### Task 1: Shared Alert Impact Helper

**Files:**
- Modify: `src/lib/__tests__/simple-ui.test.ts`
- Modify: `src/lib/simple-ui.ts`

- [x] **Step 1: Write the failing test**

Add a test for `alertAttentionLevel` mapping critical alerts to `review`, spike alerts to `monitor`, and informational new cases to `quiet`.

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/simple-ui.test.ts`
Expected: FAIL because `alertAttentionLevel` is not implemented.

- [x] **Step 3: Write minimal implementation**

Export `alertAttentionLevel(input: { severity: string; type: string }): AttentionLevel` from `src/lib/simple-ui.ts`.

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/simple-ui.test.ts`
Expected: PASS.

### Task 2: Workspace Switching In Settings

**Files:**
- Modify: `src/components/AppChrome.tsx`
- Create: `src/app/settings/page.tsx`

- [x] Remove the Brief/Simple direct switch from the Analyst sidebar and top bar.
- [x] Remove the Analyst direct switch from the Brief sidebar and top bar.
- [x] Add Settings to both workspaces.
- [x] Add `/settings` cards for Analyst workspace and Brief workspace, with direct links.
- [x] Keep `/simple` as the Brief route for compatibility.

### Task 3: Analyst Dashboard Refinement

**Files:**
- Modify: `src/app/page.tsx`

- [x] Extend the dashboard query with latest score deltas, drivers, and sector labels.
- [x] Render a compact product header instead of the oversized editorial hero.
- [x] Add attention counts and sector concentration panels.
- [x] Rename "Highest risk" to a useful review queue with attention labels and reasons.

### Task 4: Analyst Flow Parity

**Files:**
- Modify: `src/app/search/page.tsx`
- Modify: `src/app/api/search/route.ts`
- Modify: `src/app/alerts/page.tsx`
- Modify: `src/app/companies/[id]/page.tsx`
- Modify: `src/app/simple/*`

- [x] Include delta and recent-case data in search results.
- [x] Show attention status and reason in Analyst search rows.
- [x] Group alerts by investor impact without side-stripe borders.
- [x] Add a review summary to Analyst company profiles.
- [x] Rename visible Simple copy to Brief.

### Task 5: Verify, Commit, Deploy

- [x] Run `npm test`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Verify key local routes in a browser.
- [ ] Commit and push.
- [ ] Deploy to production and verify production routes.
