# LexPulse

**Litigation risk scoring for non-lawyers.**

LexPulse turns federal civil docket data into per-company risk scores,
explanatory drivers, sector benchmarks, and change alerts. Built for
investors, corporate strategy, insurers, and compliance teams who want
to monitor legal exposure across a watchlist without reading dockets.

🔗 **Live demo:** [lex-pulse-six.vercel.app](https://lex-pulse-six.vercel.app/)
📊 **API reference:** [lex-pulse-six.vercel.app/api](https://lex-pulse-six.vercel.app/api)
📐 **Methodology v3:** [`docs/methodology/risk-score-v3.md`](docs/methodology/risk-score-v3.md)

---

## What it answers

- Is this company under elevated litigation pressure right now?
- What's driving the score — case volume? Severity? A recent spike?
- How does this company compare against sector peers?
- What changed in the last 7 / 30 days?

---

## Live data

| | |
|---|---|
| SEC-listed master universe | ~8,000 |
| Litigation-linked entities | ~7,000 |
| Federal civil cases | ~100,000 |
| Judges with behavioral profiles | ~3,800 |
| Score components | 7 (volume, recency, severity, momentum, concentration, jurisdiction, judge) |
| Driver templates | 8 (deterministic, not LLM-generated) |
| Update cadence | Weekly ingest, nightly risk recompute |
| Canonical company layer | SEC-listed master-company import + optional Russell 3000 / S&P 1500 tags |

---

## Score, in 60 seconds

Each company gets a score in `[0, 100]` and a band: **low**, **moderate**, **elevated**, **high**.

```
v3_score = clamp(0, 100,
            structural_score                       // v1: volume + recency + severity
          + momentum_boost                         // -10..+10  (recent vs trailing-12mo)
          + concentration_bonus                    // 0..+10    (HHI over case categories)
        ) * jurisdiction_multiplier                // 0.85..1.15 (federal circuit weights)
          * judge_multiplier                       // 0.92..1.10 (judge dismissal-rate signal)
```

**Monotonicity guarantees:**
- v3 score equals v2 score when `judge_multiplier == 1.0`
- v2 score equals v1 score when momentum, concentration, and jurisdiction are all neutral

**Band gate:** companies with fewer than 5 historical cases are capped at *moderate*; fewer than 10 at *elevated*. Patent-trolling LLCs that score 95+ on math don't get to read as "high" without enough data behind them.

Full methodology — including driver fire conditions, cohort math, and limitations — is in [`docs/methodology/risk-score-v3.md`](docs/methodology/risk-score-v3.md).

---

## Architecture

```
┌──────────────────────┐
│ CourtListener bulk   │  full federal docket archive (~5GB CSV.bz2)
│ archive (S3)         │
└──────────┬───────────┘
           │ stream-download → bunzip2 → CSV parse
           │ filter to Russell-1000 party-name matches
           ▼
┌──────────────────────┐
│ scripts/ingest.ts    │  batched createMany inserts, idempotent
└──────────┬───────────┘  on sourceId
           ▼
┌──────────────────────┐
│ Postgres (Supabase)  │  companies, cases, links, judges,
│ + Prisma ORM         │  judge_profiles, sectors, risk_scores, alerts
└──────────┬───────────┘
           │
   ┌───────┴────────┐
   ▼                ▼
┌──────────────┐  ┌──────────────────────┐
│ compute-risk │  │ Next.js App Router   │
│ (cron, daily)│  │ — server components  │
│ chunked      │  │ — REST API           │
│ createMany   │  │ — ISR-cached pages   │
└──────────────┘  └──────────┬───────────┘
                             ▼
                  ┌──────────────────────┐
                  │ Browser              │  Dashboard, profile,
                  │                      │  search, alerts
                  └──────────────────────┘
```

### Pipeline stages

1. **Bulk fetch** — `scripts/fetch-courtlistener-bulk.ts` streams CourtListener's published archive, decompresses on the fly, filters cases by party name match, and writes JSONL. Bounded memory; only the matched subset hits disk.
2. **Ingestion** — `scripts/ingest.ts` round-trips per batch are O(1) regardless of batch size: `createMany` + `findMany` patterns, not per-row upserts. Idempotent via `sourceId` unique constraint.
3. **Entity resolution** — `src/lib/resolve.ts` collapses party-string variants onto a single `Company` row via a normalization key. Allowlist for marquee names without corp suffixes (Apple, Tesla, Pfizer, ...). Reject patterns for non-companies (Schedule A defendants, court-clerk admin text, individuals).
4. **Company master** — `scripts/import-company-master.ts` imports SEC exchange-listed companies into `company_master`; optional local CSV imports tag Russell 3000 / S&P 1500 universes without redistributing proprietary index membership.
5. **Observed parties + matching** — `scripts/fetch-courtlistener-parties.ts` stores party records where available, while `scripts/match-observed-parties.ts` writes auditable `entity_matches` with score, confidence, method, and review state.
6. **Risk scoring** — `scripts/compute-risk.ts` two-pass: pass 1 computes breakdowns + accumulates sector cohorts; pass 2 computes percentile benchmarks against peers, generates drivers, and persists snapshots in batches of 200.
7. **Alerts** — `risk_jump`, `case_spike`, `new_case`. Bulk-import suppression so a 50K-case backfill doesn't generate hundreds of new-case alerts.
8. **External events + outcomes** — `scripts/fetch-external-events.ts` ingests free SEC litigation release and CFPB enforcement signals; `scripts/extract-case-outcomes.ts` creates deterministic first-pass outcome rows.
9. **API** — Next.js App Router route handlers; versioned response shape (`v1`/`v2`/`v3`), see `/api`.
10. **Frontend** — Next.js App Router with ISR caching. Tailwind + Bricolage Grotesque + JetBrains Mono. Financial-dashboard aesthetic.

---

## Drivers

Drivers are deterministic explanatory tags computed from the snapshot's structured signals — never LLM-generated. Up to 4 fire per snapshot, sorted by weight descending.

| ID | Fires when |
|---|---|
| `risk_jump` | score increased ≥ 10 vs prior snapshot |
| `decay` | score decreased ≥ 10 vs prior snapshot |
| `case_spike` | trailing-30-day count ≥ 2× monthly baseline AND ≥ 3 |
| `severe_filing` | new case in last 7 days with category severity ≥ 0.7 |
| `category_concentration` | top category share ≥ 50% AND severity ≥ 0.6 AND ≥ 5 cases |
| `federal_circuit_focus` | top circuit share ≥ 40% AND jurisdiction multiplier ≥ 1.10 |
| `dormant_to_active` | prior trailing-30 was 0, current ≥ 2 |
| `judge_skew` | mean dismissal rate < 25% AND ≥ 50% case coverage |

All templates have unit-test fixtures in `src/lib/__tests__/drivers.test.ts`.

---

## Tech stack

- **Frontend** — Next.js 14 App Router, TypeScript (strict), TailwindCSS
- **Database** — PostgreSQL + Prisma ORM (5.22)
- **Hosting** — Vercel (frontend + API), Supabase (Postgres)
- **CI/CD** — GitHub Actions (weekly ingest, nightly risk recompute)
- **Charts** — Recharts
- **Tests** — Vitest unit coverage plus Playwright e2e smoke coverage
- **Fonts** — IBM Plex Sans, Fraunces, JetBrains Mono

---

## Run it locally

```bash
# 1. Install deps
npm install

# 2. Configure database
cp .env.example .env
# Set DATABASE_URL + DIRECT_URL (local Postgres or Supabase)
# Set COURTLISTENER_API_TOKEN if you plan to fetch real data
#   (free, register at https://www.courtlistener.com/sign-up/)

# 3. Apply schema
npx prisma migrate deploy

# 4. (optional) Pull a slice of real data
npm run fetch:courtlistener-bulk -- --out /tmp/dockets.jsonl --limit 5000

# 5. Ingest
npm run ingest -- --file /tmp/dockets.jsonl

# 6. Seed sector mappings + judge profiles
npm run seed:sectors
npm run seed:judges
npm run expand:sectors    # fuzzy-tag subsidiaries by name prefix

# 6b. Build the canonical company/entity layer
npm run import:company-master
npm run fetch:courtlistener-parties -- --limit 500
npm run match:entities -- --limit 5000
npm run fetch:external-events -- --source all --limit 100
npm run extract:case-outcomes -- --limit 3000

# 7. Compute risk
npm run risk

# 8. Run dev server
npm run dev
# → http://localhost:3000
```

---

## Tests

```bash
npm test          # vitest, 146 tests
npm run test:e2e  # Playwright browser smoke tests
npm run typecheck # tsc --noEmit
npm run build     # next build (smoke)
```

CI runs all three on every push.

---

## API

`GET /api/companies/:id/risk` returns the latest snapshot for a company:

```json
{
  "score": 89,
  "band": "high",
  "computed_at": "2026-05-08T22:00:00Z",
  "version": "v3.0",
  "change": { "delta_7d": null, "delta_30d": null },
  "drivers": [
    {
      "type": "case_spike",
      "label": "Spike in filings: 7 cases vs 1.4/mo baseline",
      "weight": 0.83,
      "evidence": { "recent30": 7, "baseline_monthly": 1.4 }
    }
  ],
  "breakdown": {
    "volume": 0.72, "recency": 0.84, "severity": 0.55,
    "momentum": 0.68, "concentration": 0.41,
    "jurisdiction": 1.08, "judge": 1.04
  },
  "benchmark": {
    "sector": "healthcare",
    "cohort_size": 142,
    "percentile": 87.3,
    "sector_median": 41,
    "z_score": 1.42,
    "confidence": "full"
  },
  "sources": [
    {
      "name": "CourtListener / Free Law Project",
      "license": "CC BY-ND 4.0",
      "url": "https://www.courtlistener.com/"
    }
  ]
}
```

`?version=v1`, `?version=v2`, `?version=v3` pin to a specific methodology revision. Default returns the latest.

Full reference at [lex-pulse-six.vercel.app/api](https://lex-pulse-six.vercel.app/api).

`GET /api/coverage` returns company-master, entity-resolution, source-refresh, external-event, and outcome coverage metrics. The same data powers `/coverage`.

`npm run promote:company-master` reconciles high-confidence `company_master` matches into product-facing
companies, backfills case links, and keeps the dashboard distinction between SEC universe,
litigation-linked entities, risk-scored entities, and unresolved observed parties explicit.

---

## Limitations

- **Federal civil only.** State courts, regulatory agency actions, arbitration, and international litigation are out of scope.
- **Outcome data is first-pass.** Settlement / dismissal / judgment / injunction signals are deterministic and confidence-scored; they are not yet a complete docket-entry outcome model.
- **Freshness has two modes.** Daily incremental jobs keep recent sources moving; CourtListener bulk archives remain quarterly snapshots.
- **Entity resolution is deterministic and auditable.** Aliases, subsidiaries, and parent rollups now produce confidence-scored `entity_matches`; ambiguous matches still need review.
- **Sector coverage is partial.** Companies without a ticker or unmatched in the seed set get no benchmark.
- **The score is signal, not adjudication.** Don't make legal decisions from a number on a dashboard.

---

## Data attribution

Litigation data is sourced from **CourtListener** via the Free Law Project, licensed under [CC BY-ND 4.0](https://creativecommons.org/licenses/by-nd/4.0/).

Every score response includes a `sources` block citing the upstream. Every UI page footers the attribution. Case-row links open the canonical CourtListener docket page in a new tab.

If you're a heavy user of CourtListener, please consider [supporting Free Law Project](https://free.law/donate/) — the bulk archives that make this kind of analysis possible aren't free to host or maintain.

---

## License

MIT. See [`LICENSE`](LICENSE).

The methodology document and design specs in `docs/` are released under the same license as the code.
