import "dotenv/config";

import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { prisma } from "../src/lib/db";
import { normalizeCompanyName } from "../src/lib/resolve";
import { parseUniverseCsvRows, universeTagForIndex } from "../src/lib/universe-import";
import { failIngestRun, finishIngestRun, startIngestRun } from "./lib/data-ingest";

type Args = {
  file: string | null;
  index: string | null;
  sourceUrl: string | null;
  dryRun: boolean;
};

function parseArgs(): Args {
  const args: Args = { file: null, index: null, sourceUrl: null, dryRun: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--file") args.file = argv[++i];
    else if (arg === "--index") args.index = argv[++i];
    else if (arg === "--source-url") args.sourceUrl = argv[++i];
    else if (arg === "--dry-run") args.dryRun = true;
  }
  return args;
}

async function main() {
  const args = parseArgs();
  if (!args.file || !args.index) {
    throw new Error("Usage: npm run import:index-universe -- --file constituents.csv --index sp1500|russell3000");
  }

  const tag = universeTagForIndex(args.index);
  const csvRows = parse(fs.readFileSync(args.file, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>;
  const rows = parseUniverseCsvRows(csvRows);

  if (args.dryRun) {
    console.log(`dry run: ${rows.length} ${args.index} constituents would be matched with tag ${tag}`);
    return;
  }

  const run = await startIngestRun(prisma, "universe", `import_${tag}`, {
    file: args.file,
    index: args.index,
    sourceUrl: args.sourceUrl,
  });
  try {
    let updated = 0;
    let unmatched = 0;
    for (const row of rows) {
      const normKey = row.name ? normalizeCompanyName(row.name).key : null;
      const found = await prisma.companyMaster.findFirst({
        where: {
          OR: [
            row.cik ? { cik: row.cik } : undefined,
            row.ticker ? { ticker: row.ticker } : undefined,
            normKey ? { normKey } : undefined,
          ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
        },
        select: { id: true, universe: true },
      });
      if (!found) {
        unmatched++;
        continue;
      }
      if (!found.universe.includes(tag)) {
        await prisma.companyMaster.update({
          where: { id: found.id },
          data: { universe: [...found.universe, tag], sourceUrl: args.sourceUrl ?? undefined },
        });
        updated++;
      }
    }

    await finishIngestRun(prisma, run.id, {
      rowsFetched: rows.length,
      rowsUpdated: updated,
      rowsFailed: unmatched,
      checkpoint: { importedAt: new Date().toISOString(), tag },
      metadata: { unmatched },
    });
    console.log(`${args.index} universe import complete: ${updated} masters tagged, ${unmatched} unmatched`);
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
