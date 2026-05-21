import "dotenv/config";

import { prisma } from "../src/lib/db";
import { classifyLegalOutcome } from "../src/lib/outcomes";
import { failIngestRun, finishIngestRun, startIngestRun } from "./lib/data-ingest";

type Args = {
  limit: number;
};

function parseArgs(): Args {
  const args: Args = { limit: 2000 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") args.limit = Number(argv[++i]);
  }
  if (!Number.isFinite(args.limit) || args.limit <= 0) args.limit = 2000;
  return args;
}

async function main() {
  const args = parseArgs();
  const run = await startIngestRun(prisma, "courtlistener", "outcome_extraction", args);
  try {
    const cases = await prisma.case.findMany({
      where: {
        OR: [
          { dateTerminated: { not: null } },
          { events: { some: {} } },
        ],
        outcomes: { none: {} },
      },
      take: args.limit,
      orderBy: { dateFiled: "desc" },
      include: {
        events: {
          orderBy: { occurredAt: "desc" },
          take: 5,
        },
      },
    });

    const outcomeRows: Array<{
      caseId: string;
      outcomeType: string;
      outcomeDate: Date | null;
      source: string;
      confidence: number;
      evidence: string;
    }> = [];
    for (const caseRef of cases) {
      const evidenceTexts = [
        caseRef.caseName,
        caseRef.dateTerminated ? "Civil case terminated" : "",
        ...caseRef.events.map((event) => `${event.type} ${JSON.stringify(event.payload ?? {})}`),
      ].filter(Boolean);
      const classified = evidenceTexts
        .map((text) => classifyLegalOutcome(text))
        .sort((a, b) => b.confidence - a.confidence)[0];
      if (!classified || classified.outcomeType === "unknown") continue;
      outcomeRows.push({
        caseId: caseRef.id,
        outcomeType: classified.outcomeType,
        outcomeDate: caseRef.dateTerminated,
        source: "deterministic_case_text",
        confidence: classified.confidence,
        evidence: classified.matchedText,
      });
    }

    let inserted = 0;
    for (const batch of chunks(outcomeRows, 1000)) {
      const result = await prisma.caseOutcome.createMany({ data: batch, skipDuplicates: true });
      inserted += result.count;
    }

    await finishIngestRun(prisma, run.id, {
      rowsFetched: cases.length,
      rowsInserted: inserted,
      checkpoint: { extractedAt: new Date().toISOString() },
    });
    console.log(`case outcomes extracted: ${inserted} from ${cases.length} candidate cases`);
  } catch (error) {
    await failIngestRun(prisma, run.id, error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
