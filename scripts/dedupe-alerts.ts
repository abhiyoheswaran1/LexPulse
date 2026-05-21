import "dotenv/config";

import { prisma } from "../src/lib/db";
import { failIngestRun, finishIngestRun, startIngestRun } from "./lib/data-ingest";

type Args = {
  dryRun: boolean;
};

function parseArgs(): Args {
  return { dryRun: process.argv.slice(2).includes("--dry-run") };
}

async function countDuplicates() {
  const [summary] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY "companyId", type, COALESCE(refs::TEXT, '{}')
          ORDER BY "createdAt" ASC, id ASC
        ) AS rn
      FROM alerts
      WHERE type IN ('new_case', 'case_spike', 'risk_jump')
    )
    SELECT COUNT(*) AS count
    FROM ranked
    WHERE rn > 1
  `;
  return Number(summary.count);
}

async function deleteDuplicates() {
  const deleted = await prisma.$executeRaw`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY "companyId", type, COALESCE(refs::TEXT, '{}')
          ORDER BY "createdAt" ASC, id ASC
        ) AS rn
      FROM alerts
      WHERE type IN ('new_case', 'case_spike', 'risk_jump')
    )
    DELETE FROM alerts a
    USING ranked r
    WHERE a.id = r.id
      AND r.rn > 1
  `;
  return Number(deleted);
}

async function main() {
  const args = parseArgs();
  const duplicates = await countDuplicates();
  if (args.dryRun) {
    console.log(`dry run: ${duplicates} duplicate alerts would be removed`);
    await prisma.$disconnect();
    return;
  }

  const run = await startIngestRun(prisma, "alerts", "dedupe", args);
  try {
    const deleted = await deleteDuplicates();
    await finishIngestRun(prisma, run.id, {
      rowsFetched: duplicates,
      rowsInserted: 0,
      rowsUpdated: 0,
      rowsFailed: 0,
      checkpoint: { dedupedAt: new Date().toISOString() },
      metadata: { deleted },
    });
    console.log(`alert dedupe complete: ${deleted} duplicate alerts removed`);
  } catch (error) {
    await failIngestRun(prisma, run.id, error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
