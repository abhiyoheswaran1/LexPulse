# LexPulse

**Litigation intelligence for non-lawyers.**

LexPulse turns raw court data into company-level litigation profiles, risk
scores, and alerts. Built for investors, corporate strategy teams, insurers,
and compliance — not for litigators.

---

## What it answers

- Is this company risky from a litigation perspective?
- Has something changed recently?
- Are there emerging patterns?

---

## Architecture

```
                ┌─────────────────────┐
 CourtListener  │  scripts/ingest.ts  │   streaming JSON parse,
   bulk JSON    │   (Node, streaming) │   batch insert into Postgres
 ──────────────►│                     │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  Entity Resolution  │   normalize party strings,
                │  (lib/resolve.ts)   │   fuzzy match → companies
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │     PostgreSQL      │   companies, cases,
                │     (Prisma ORM)    │   company_case_link, judges,
                │                     │   risk_scores, events, alerts
                └──────────┬──────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
   ┌──────────────────┐      ┌──────────────────┐
   │  scripts/        │      │  Next.js API     │   REST:
   │  compute-risk.ts │      │  (app/api/*)     │   /companies, /search,
   │  (cron-style)    │      │                  │   /alerts, /risk
   └──────────────────┘      └────────┬─────────┘
                                      │
                                      ▼
                            ┌──────────────────┐
                            │  Next.js (App)   │   Dashboard, Profile,
                            │  Tailwind + UI   │   Search, Alerts
                            └──────────────────┘
```

### Pipeline stages

1. **Ingestion** — `scripts/ingest.ts` streams CourtListener-style docket JSON
   (newline-delimited or array) and batch-inserts into Postgres. Designed so
   the full bulk dataset is never loaded into memory.
2. **Entity resolution** — party strings (`"Acme Corp."`, `"ACME CORPORATION"`,
   `"Acme Corp, Inc."`) collapse onto a single `Company` row using a
   normalization key + simple fuzzy match. The resolver is a pure module so it
   can be swapped for an embedding/LLM-backed version later without touching
   the ingestion path.
3. **Risk scoring** — `scripts/compute-risk.ts` runs over each company and
   writes a row into `risk_scores`. v1 heuristic combines volume, recency,
   and a severity proxy (nature-of-suit weights).
4. **Alerts** — generated as a side effect of risk computation: "new case",
   "case spike" (rolling-window deviation).
5. **API** — Next.js App Router route handlers, all reading from Prisma.
6. **Frontend** — Next.js App Router, server components for data, client
   components for interactive bits. Visual style: financial dashboard
   (dense, monospace numbers, sparklines, muted palette).

---

## Tech stack

- **Frontend** — Next.js 14 (App Router), TypeScript, TailwindCSS, shadcn/ui primitives
- **Backend** — Next.js API routes
- **DB** — PostgreSQL + Prisma ORM
- **Charts** — Recharts

---

## Setup

```bash
# 1. Install
npm install

# 2. Configure database
cp .env.example .env
# Edit DATABASE_URL to point at your Postgres instance

# 3. Run migrations
npx prisma migrate dev --name init

# 4. Seed sample data (synthetic CourtListener-shaped fixtures)
npm run seed

# 5. Compute risk scores + alerts
npm run risk

# 6. Run dev server
npm run dev
```

Open <http://localhost:3000>.

### Ingesting real CourtListener data

```bash
# Download a slice of dockets bulk (compressed JSONL)
curl -O https://com-courtlistener-storage.s3-us-west-2.amazonaws.com/bulk-data/dockets-2024-01-01.jsonl.bz2
bunzip2 dockets-2024-01-01.jsonl.bz2

# Stream-ingest
npm run ingest -- --file ./dockets-2024-01-01.jsonl --limit 50000
```

The ingester is streaming — memory is bounded regardless of file size.

---

## Risk score (v1)

Score ∈ [0, 100] computed per company:

```
score = clamp(
    35 * volumeFactor       // log-scaled count of cases
  + 35 * recencyFactor      // share of cases in last 12 / 24 months
  + 30 * severityFactor     // weighted average of nature-of-suit weights
, 0, 100)
```

Severity weights are in `src/lib/risk.ts`. They're heuristic — securities
fraud and antitrust score higher than contract disputes. This is intentionally
transparent and tunable; the goal is signal, not adjudication.

Bands:

- 0–24  green (Low)
- 25–49 yellow (Moderate)
- 50–74 orange (Elevated)
- 75–100 red (High)

---

## Roadmap (explicitly out of MVP scope)

- LLM-backed entity resolution & ticker linking
- Outcome / damages extraction from opinions
- Sector benchmarks
- Email + webhook alert delivery
- API keys / billing
