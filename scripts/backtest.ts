// Walk-forward backtest harness. Calibrates v3 score against SEC 8-K
// material-event disclosures.
//
// At each anchor date D:
//   - For each company with a CIK (public-company subset):
//     - Compute v3 score using cases.dateFiled <= D and judge profiles
//       built from cases.dateTerminated <= D.
//     - For windows {30, 90, 180}: did the company file any 8-K with at
//       least one MaterialEvent in (D, D+window]?
//     - Persist BacktestObservation.
//
// Output statistics:
//   1) Hit rate by band × forward window
//   2) Lift over baseline (band hit rate / overall base rate)
//   3) Information coefficient — Spearman rank correlation between
//      scoreAtAnchor and the forward-window indicator, computed per
//      anchor date and aggregated as mean/std.
//   4) Decile lift curve — score deciles vs event rate.
//
// Output:
//   - BacktestObservation rows in DB (durable, inspectable)
//   - /tmp/backtest-output.json (machine-readable summary)
//   - stdout summary tables
//
// Usage:
//   tsx scripts/backtest.ts                          # 24 monthly anchors
//   tsx scripts/backtest.ts --anchors 12             # last 12 months only
//   tsx scripts/backtest.ts --version v3 --wipe      # wipe prior obs first

import "dotenv/config";
import fs from "node:fs";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { computeRiskV3, type CaseLiteV3 } from "../src/lib/risk";
import type { JudgeProfileLite } from "../src/lib/judges";
import {
  hitRateByBand,
  spearman,
  decileLift,
  meanStd,
  type BacktestObs,
} from "../src/lib/backtest-stats";

const ONE_DAY = 86400000;
const SCORE_VERSION = "v3";

type Args = {
  anchors: number;
  windowsDays: number[]; // [30, 90, 180]
  wipe: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = { anchors: 24, windowsDays: [30, 90, 180], wipe: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--anchors") out.anchors = parseInt(argv[++i], 10);
    else if (a === "--wipe") out.wipe = true;
  }
  return out;
}

function monthlyAnchors(count: number): Date[] {
  // Take the first day of each of the last `count` months, ending at
  // 180 days before today (so every observation has a 180d forward
  // window already populated by data we have).
  const today = new Date();
  const end = new Date(today.getTime() - 180 * ONE_DAY);
  end.setUTCDate(1);
  end.setUTCHours(0, 0, 0, 0);
  const out: Date[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCMonth(d.getUTCMonth() - i);
    out.push(d);
  }
  return out;
}

type CompanyRow = {
  id: string;
  name: string;
  cik: string;
  cases: { dateFiled: Date | null; dateTerminated: Date | null; natureOfSuit: string | null; court: string | null; judgeId: string | null }[];
};

async function loadPublicCompanies(): Promise<CompanyRow[]> {
  const rows = await prisma.company.findMany({
    where: { cik: { not: null } },
    select: {
      id: true,
      name: true,
      cik: true,
      links: {
        select: {
          caseRef: {
            select: {
              dateFiled: true,
              dateTerminated: true,
              natureOfSuit: true,
              court: true,
              judgeId: true,
            },
          },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    cik: r.cik!,
    cases: r.links.map((l) => l.caseRef),
  }));
}

// Build a point-in-time judge profile map from cases known as-of `anchor`.
// Mirrors seed-judges logic but inline so we can re-derive at each anchor.
async function loadJudgeProfilesAt(anchor: Date): Promise<Map<string, JudgeProfileLite>> {
  // dismissalRate = fraction of terminated cases with duration < 90 days.
  // We restrict to cases whose dateTerminated <= anchor — i.e., known
  // outcomes as-of that date. caseCount is the n behind the estimate.
  const rows = await prisma.case.findMany({
    where: { judgeId: { not: null }, dateTerminated: { not: null, lte: anchor }, dateFiled: { not: null } },
    select: { judgeId: true, dateFiled: true, dateTerminated: true },
  });
  const agg = new Map<string, { dismissed: number; total: number }>();
  for (const c of rows) {
    if (!c.judgeId || !c.dateFiled || !c.dateTerminated) continue;
    const dur = (c.dateTerminated.getTime() - c.dateFiled.getTime()) / ONE_DAY;
    if (dur < 0) continue;
    const cur = agg.get(c.judgeId) ?? { dismissed: 0, total: 0 };
    cur.total++;
    if (dur < 90) cur.dismissed++;
    agg.set(c.judgeId, cur);
  }
  const out = new Map<string, JudgeProfileLite>();
  for (const [judgeId, { dismissed, total }] of agg) {
    out.set(judgeId, {
      dismissalRate: total >= 5 ? dismissed / total : null,
      caseCount: total,
    });
  }
  return out;
}

// Forward 8-K events keyed by companyId, queried once per anchor.
async function loadForwardEventsAt(anchor: Date, maxWindow: number): Promise<Map<string, Date[]>> {
  const end = new Date(anchor.getTime() + maxWindow * ONE_DAY);
  const filings = await prisma.secEdgarFiling.findMany({
    where: {
      filedAt: { gt: anchor, lte: end },
      events: { some: {} }, // only filings with at least one classified event
    },
    select: { companyId: true, filedAt: true },
  });
  const byCo = new Map<string, Date[]>();
  for (const f of filings) {
    const arr = byCo.get(f.companyId) ?? [];
    arr.push(f.filedAt);
    byCo.set(f.companyId, arr);
  }
  return byCo;
}

// Forward dollar-amount sum keyed by companyId, queried once per anchor.
async function loadForwardAmountsAt(anchor: Date, window: number): Promise<Map<string, number>> {
  const end = new Date(anchor.getTime() + window * ONE_DAY);
  const events = await prisma.materialEvent.findMany({
    where: {
      amountUsd: { not: null },
      filing: { filedAt: { gt: anchor, lte: end } },
    },
    select: { amountUsd: true, filing: { select: { companyId: true } } },
  });
  const byCo = new Map<string, number>();
  for (const e of events) {
    if (!e.amountUsd) continue;
    const co = e.filing.companyId;
    byCo.set(co, (byCo.get(co) ?? 0) + Number(e.amountUsd));
  }
  return byCo;
}

function bandFor(score: number): string {
  if (score >= 75) return "high";
  if (score >= 50) return "elevated";
  if (score >= 25) return "moderate";
  return "low";
}

async function runAnchor(
  anchor: Date,
  companies: CompanyRow[],
): Promise<{ inserted: number }> {
  const judgeProfiles = await loadJudgeProfilesAt(anchor);
  const forwardEvents = await loadForwardEventsAt(anchor, 180);
  const forwardAmounts90 = await loadForwardAmountsAt(anchor, 90);

  const rows: Prisma.BacktestObservationCreateManyInput[] = [];
  for (const co of companies) {
    const casesAtAnchor: CaseLiteV3[] = co.cases
      .filter((c) => c.dateFiled && c.dateFiled <= anchor)
      .map((c) => ({
        dateFiled: c.dateFiled,
        natureOfSuit: c.natureOfSuit,
        court: c.court,
        judgeId: c.judgeId,
      }));
    if (casesAtAnchor.length === 0) continue;
    const v3 = computeRiskV3(casesAtAnchor, judgeProfiles, anchor);
    const evDates = forwardEvents.get(co.id) ?? [];
    const cutoff30 = new Date(anchor.getTime() + 30 * ONE_DAY);
    const cutoff90 = new Date(anchor.getTime() + 90 * ONE_DAY);
    const cutoff180 = new Date(anchor.getTime() + 180 * ONE_DAY);
    const had30 = evDates.some((d) => d <= cutoff30);
    const had90 = evDates.some((d) => d <= cutoff90);
    const had180 = evDates.some((d) => d <= cutoff180);
    const count90 = evDates.filter((d) => d <= cutoff90).length;
    const amt90 = forwardAmounts90.get(co.id) ?? 0;

    rows.push({
      anchorDate: anchor,
      companyId: co.id,
      scoreAtAnchor: v3.score,
      band: bandFor(v3.score),
      caseCountAtAnchor: casesAtAnchor.length,
      hadEvent30: had30,
      hadEvent90: had90,
      hadEvent180: had180,
      eventCount90: count90,
      totalAmountUsd90: amt90 > 0 ? new Prisma.Decimal(amt90) : null,
      scoreVersion: SCORE_VERSION,
    });
  }

  // Idempotent: delete then re-insert this anchor's observations.
  await prisma.backtestObservation.deleteMany({
    where: { anchorDate: anchor, scoreVersion: SCORE_VERSION },
  });
  if (rows.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await prisma.backtestObservation.createMany({ data: rows.slice(i, i + CHUNK) });
    }
  }
  return { inserted: rows.length };
}

async function summarize(anchors: Date[]) {
  const all = await prisma.backtestObservation.findMany({
    where: { scoreVersion: SCORE_VERSION, anchorDate: { in: anchors } },
    select: {
      anchorDate: true,
      scoreAtAnchor: true,
      band: true,
      hadEvent30: true,
      hadEvent90: true,
      hadEvent180: true,
    },
  });
  console.log(`\n[summary] ${all.length} observations across ${anchors.length} anchors\n`);

  // Per-anchor IC for each window
  const icByWindow: Record<number, number[]> = { 30: [], 90: [], 180: [] };
  const byAnchor = new Map<number, BacktestObs[]>();
  for (const o of all) {
    const t = o.anchorDate.getTime();
    const arr = byAnchor.get(t) ?? [];
    arr.push(o);
    byAnchor.set(t, arr);
  }
  for (const [_, obs] of byAnchor) {
    const xs = obs.map((o) => o.scoreAtAnchor);
    const ys30 = obs.map((o) => (o.hadEvent30 ? 1 : 0));
    const ys90 = obs.map((o) => (o.hadEvent90 ? 1 : 0));
    const ys180 = obs.map((o) => (o.hadEvent180 ? 1 : 0));
    icByWindow[30].push(spearman(xs, ys30));
    icByWindow[90].push(spearman(xs, ys90));
    icByWindow[180].push(spearman(xs, ys180));
  }
  const out: Record<string, unknown> = {
    runAt: new Date().toISOString(),
    scoreVersion: SCORE_VERSION,
    anchors: anchors.map((a) => a.toISOString().slice(0, 10)),
    nObservations: all.length,
    ic: {
      "30d": meanStd(icByWindow[30]),
      "90d": meanStd(icByWindow[90]),
      "180d": meanStd(icByWindow[180]),
    },
    hitRateByBand: {
      "30d": hitRateByBand(all, 30),
      "90d": hitRateByBand(all, 90),
      "180d": hitRateByBand(all, 180),
    },
    decileLift: {
      "30d": decileLift(all, 30),
      "90d": decileLift(all, 90),
      "180d": decileLift(all, 180),
    },
  };

  // Console summary
  for (const w of [30, 90, 180] as const) {
    console.log(`\n— Forward window ${w}d —`);
    const ic = (out.ic as any)[`${w}d`];
    console.log(`  IC: mean=${ic.mean.toFixed(4)}  std=${ic.std.toFixed(4)}  n=${ic.n}`);
    const hr = (out.hitRateByBand as any)[`${w}d`];
    console.log(`  Base rate: ${(hr.baseRate * 100).toFixed(2)}%`);
    for (const band of ["low", "moderate", "elevated", "high"]) {
      const b = hr.byBand[band];
      if (!b) continue;
      console.log(
        `  ${band.padEnd(10)}  n=${String(b.n).padStart(4)}  hits=${String(b.hits).padStart(3)}  rate=${(b.rate * 100).toFixed(1)}%  lift=${b.lift.toFixed(2)}x`
      );
    }
  }

  fs.writeFileSync("/tmp/backtest-output.json", JSON.stringify(out, null, 2));
  console.log("\n[summary] wrote /tmp/backtest-output.json");
}

async function main() {
  const args = parseArgs();
  const anchors = monthlyAnchors(args.anchors);
  console.log(`[backtest] ${anchors.length} anchors from ${anchors[0].toISOString().slice(0, 10)} to ${anchors[anchors.length - 1].toISOString().slice(0, 10)}`);

  if (args.wipe) {
    await prisma.backtestObservation.deleteMany({ where: { scoreVersion: SCORE_VERSION } });
    console.log(`[backtest] wiped prior ${SCORE_VERSION} observations`);
  }

  const companies = await loadPublicCompanies();
  console.log(`[backtest] ${companies.length} public companies`);

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const t0 = Date.now();
    const { inserted } = await runAnchor(a, companies);
    console.log(
      `[anchor ${i + 1}/${anchors.length}] ${a.toISOString().slice(0, 10)}  obs=${inserted}  ${Date.now() - t0}ms`
    );
  }

  await summarize(anchors);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
