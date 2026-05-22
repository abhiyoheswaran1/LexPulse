import "dotenv/config";

import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { chooseCanonicalCompany, shouldMergeCompanyPair, type MergeCandidate } from "../src/lib/entity-quality";
import { failIngestRun, finishIngestRun, startIngestRun } from "./lib/data-ingest";

type Args = {
  dryRun: boolean;
  limit: number | null;
};

type DuplicateGroup = {
  companyMasterId: string;
  count: bigint;
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

async function loadDuplicateGroups(limit: number | null) {
  const groups = await prisma.$queryRaw<DuplicateGroup[]>`
    SELECT "companyMasterId", COUNT(*) AS count
    FROM companies
    WHERE "companyMasterId" IS NOT NULL
      AND "displayStatus" = 'visible'
    GROUP BY "companyMasterId"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `;
  return limit ? groups.slice(0, limit) : groups;
}

async function loadCandidates(companyMasterId: string): Promise<MergeCandidate[]> {
  const rows = await prisma.company.findMany({
    where: { companyMasterId, displayStatus: "visible" },
    select: {
      id: true,
      name: true,
      ticker: true,
      cik: true,
      createdAt: true,
      _count: { select: { links: true, scores: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ticker: row.ticker,
    cik: row.cik,
    caseCount: row._count.links,
    scoreCount: row._count.scores,
    createdAt: row.createdAt,
  }));
}

async function mergeDuplicateIntoCanonical(duplicateId: string, canonicalId: string) {
  await prisma.$transaction(
    async (tx) => {
      const duplicateLinks = await tx.companyCaseLink.findMany({
        where: { companyId: duplicateId },
        select: { caseId: true, role: true, rawParty: true },
      });
      if (duplicateLinks.length) {
        await tx.companyCaseLink.createMany({
          data: duplicateLinks.map((link) => ({
            companyId: canonicalId,
            caseId: link.caseId,
            role: link.role,
            rawParty: link.rawParty,
          })),
          skipDuplicates: true,
        });
      }

      await tx.observedParty.updateMany({ where: { companyId: duplicateId }, data: { companyId: canonicalId } });
      await tx.externalEvent.updateMany({ where: { companyId: duplicateId }, data: { companyId: canonicalId } });
      await tx.alert.updateMany({ where: { companyId: duplicateId }, data: { companyId: canonicalId } });

      const watchlistRows = await tx.accountWatchlist.findMany({
        where: { companyId: duplicateId },
        select: { accountId: true, savedAt: true },
      });
      if (watchlistRows.length) {
        await tx.accountWatchlist.createMany({
          data: watchlistRows.map((row) => ({
            id: randomUUID(),
            accountId: row.accountId,
            companyId: canonicalId,
            savedAt: row.savedAt,
          })),
          skipDuplicates: true,
        });
      }
      await tx.accountWatchlist.deleteMany({ where: { companyId: duplicateId } });

      await tx.company.update({
        where: { id: duplicateId },
        data: {
          displayStatus: "merged",
          qualityReason: "duplicate_company_master",
          canonicalCompanyId: canonicalId,
        },
      });
    },
    { timeout: 60_000 },
  );
}

async function main() {
  const args = parseArgs();
  const groups = await loadDuplicateGroups(args.limit);

  if (args.dryRun) {
    console.log(`dry run: ${groups.length} duplicate master groups would be reviewed for merge`);
    for (const group of groups) {
      const candidates = await loadCandidates(group.companyMasterId);
      const canonical = chooseCanonicalCompany(candidates);
      console.log(
        `${group.companyMasterId}: keep ${canonical?.name ?? "unknown"}; merge ${candidates
          .filter((candidate) => canonical && shouldMergeCompanyPair(canonical, candidate))
          .map((candidate) => candidate.name)
          .join(" | ") || "none"}`,
      );
    }
    return;
  }

  const run = await startIngestRun(prisma, "entity_quality", "merge_duplicates", args);
  try {
    let merged = 0;
    for (const group of groups) {
      const candidates = await loadCandidates(group.companyMasterId);
      const canonical = chooseCanonicalCompany(candidates);
      if (!canonical) continue;
      for (const candidate of candidates) {
        if (candidate.id === canonical.id) continue;
        if (!shouldMergeCompanyPair(canonical, candidate)) continue;
        await mergeDuplicateIntoCanonical(candidate.id, canonical.id);
        merged++;
      }
    }

    await finishIngestRun(prisma, run.id, {
      rowsFetched: groups.length,
      rowsUpdated: merged,
      checkpoint: { mergedAt: new Date().toISOString() },
    });
    console.log(`duplicate company merge complete: ${merged} companies soft-merged across ${groups.length} master groups`);
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
