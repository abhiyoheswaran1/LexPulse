// Run the deterministic material-event classifier over every
// SecEdgarFiling.itemTextExcerpt and persist MaterialEvent rows.
//
// Idempotent: deletes existing MaterialEvent rows for a filing before
// re-classifying. Cheap because the classifier is in-memory regex.
//
// Usage:
//   tsx scripts/extract-material-events.ts            # all filings
//   tsx scripts/extract-material-events.ts --since 2024-01-01

import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { classifyMaterialEvents } from "../src/lib/material-events";

function parseSince(): Date | null {
  const i = process.argv.indexOf("--since");
  if (i < 0) return null;
  const d = new Date(process.argv[i + 1]);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function main() {
  const since = parseSince();
  console.log(`[extract] since=${since?.toISOString().slice(0, 10) ?? "all"}`);

  const filings = await prisma.secEdgarFiling.findMany({
    where: {
      itemTextExcerpt: { not: null },
      ...(since ? { filedAt: { gte: since } } : {}),
    },
    select: { id: true, itemTextExcerpt: true },
  });
  console.log(`[extract] ${filings.length} filings to scan`);

  // Wipe existing events for these filings (idempotent re-run).
  await prisma.materialEvent.deleteMany({
    where: { filingId: { in: filings.map((f) => f.id) } },
  });

  const rows: Prisma.MaterialEventCreateManyInput[] = [];
  let withEvents = 0;
  for (const f of filings) {
    const events = classifyMaterialEvents(f.itemTextExcerpt ?? "");
    if (events.length === 0) continue;
    withEvents++;
    for (const e of events) {
      rows.push({
        filingId: f.id,
        eventType: e.eventType,
        confidence: e.confidence,
        snippet: e.snippet,
        amountUsd: e.amountUsd != null ? new Prisma.Decimal(e.amountUsd) : null,
      });
    }
  }

  // Bulk insert in chunks of 500 to avoid statement-timeout / memory peaks.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await prisma.materialEvent.createMany({ data: rows.slice(i, i + CHUNK) });
  }

  console.log(
    `[extract] inserted ${rows.length} events from ${withEvents} filings ` +
      `(${(withEvents / Math.max(filings.length, 1) * 100).toFixed(1)}% of filings had ≥1 event)`
  );

  // Report distribution of event types
  const byType = await prisma.materialEvent.groupBy({
    by: ["eventType"],
    _count: { _all: true },
  });
  for (const row of byType.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${row.eventType.padEnd(22)} ${row._count._all}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
