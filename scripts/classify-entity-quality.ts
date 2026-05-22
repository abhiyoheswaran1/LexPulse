import "dotenv/config";

import { prisma } from "../src/lib/db";
import { classifyEntityName } from "../src/lib/entity-quality";
import { failIngestRun, finishIngestRun, startIngestRun } from "./lib/data-ingest";

type Args = {
  dryRun: boolean;
  limit: number | null;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const limitIndex = argv.indexOf("--limit");
  const limit = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : null;
  return {
    dryRun: argv.includes("--dry-run"),
    limit: limit && Number.isFinite(limit) && limit > 0 ? limit : null,
  };
}

async function main() {
  const args = parseArgs();
  const run = args.dryRun ? null : await startIngestRun(prisma, "entity_quality", "classify", args);
  try {
    const [companies, parties] = await Promise.all([
      prisma.company.findMany({
        where: { displayStatus: { not: "merged" } },
        take: args.limit ?? undefined,
        select: { id: true, name: true, displayStatus: true, qualityReason: true },
      }),
      prisma.observedParty.findMany({
        take: args.limit ?? undefined,
        select: { id: true, rawName: true, displayStatus: true, qualityReason: true },
      }),
    ]);

    const companiesById = new Map(companies.map((company) => [company.id, company]));
    const partiesById = new Map(parties.map((party) => [party.id, party]));
    const companyClassifications = companies.map((company) => ({ id: company.id, ...classifyEntityName(company.name) }));
    const partyClassifications = parties.map((party) => ({ id: party.id, ...classifyEntityName(party.rawName) }));
    const companyUpdates = companyClassifications.filter((row) => {
      const current = companiesById.get(row.id);
      return current?.displayStatus !== row.displayStatus || current?.qualityReason !== row.reason;
    });
    const partyUpdates = partyClassifications.filter((row) => {
      const current = partiesById.get(row.id);
      return current?.displayStatus !== row.displayStatus || current?.qualityReason !== row.reason;
    });

    if (args.dryRun) {
      const companySamples = companyUpdates
        .filter((row) => row.displayStatus === "quarantined")
        .slice(0, 20)
        .map((row) => companiesById.get(row.id)?.name)
        .filter(Boolean);
      const partySamples = partyUpdates
        .filter((row) => row.displayStatus === "quarantined")
        .slice(0, 20)
        .map((row) => partiesById.get(row.id)?.rawName)
        .filter(Boolean);
      console.log(
        `dry run: ${companyClassifications.filter((row) => row.displayStatus === "quarantined").length} companies and ${partyClassifications.filter((row) => row.displayStatus === "quarantined").length} observed parties would be quarantined; ${companyUpdates.length + partyUpdates.length} rows would change`,
      );
      if (companySamples.length) console.log(`company samples: ${companySamples.join(" | ")}`);
      if (partySamples.length) console.log(`party samples: ${partySamples.join(" | ")}`);
      return;
    }

    let updatedCompanies = 0;
    for (const group of groupByClassification(companyUpdates)) {
      for (const ids of chunks(group.ids, 1_000)) {
        const result = await prisma.company.updateMany({
          where: { id: { in: ids } },
          data: { displayStatus: group.displayStatus, qualityReason: group.reason },
        });
        updatedCompanies += result.count;
      }
    }

    let updatedParties = 0;
    for (const group of groupByClassification(partyUpdates)) {
      for (const ids of chunks(group.ids, 1_000)) {
        const result = await prisma.observedParty.updateMany({
          where: { id: { in: ids } },
          data: { displayStatus: group.displayStatus, qualityReason: group.reason },
        });
        updatedParties += result.count;
      }
    }

    if (run) {
      await finishIngestRun(prisma, run.id, {
        rowsFetched: companies.length + parties.length,
        rowsUpdated: updatedCompanies + updatedParties,
        checkpoint: { classifiedAt: new Date().toISOString() },
        metadata: {
          quarantinedCompanies: companyUpdates.filter((row) => row.displayStatus === "quarantined").length,
          quarantinedObservedParties: partyUpdates.filter((row) => row.displayStatus === "quarantined").length,
        },
      });
    }

    console.log(`entity quality classified: ${updatedCompanies} companies, ${updatedParties} observed parties`);
  } catch (error) {
    if (run) await failIngestRun(prisma, run.id, error);
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

function groupByClassification(
  rows: Array<{ id: string; displayStatus: "visible" | "quarantined"; reason: string | null }>,
) {
  const groups = new Map<string, { displayStatus: "visible" | "quarantined"; reason: string | null; ids: string[] }>();
  for (const row of rows) {
    const key = `${row.displayStatus}:${row.reason ?? ""}`;
    const group = groups.get(key) ?? { displayStatus: row.displayStatus, reason: row.reason, ids: [] };
    group.ids.push(row.id);
    groups.set(key, group);
  }
  return [...groups.values()];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
