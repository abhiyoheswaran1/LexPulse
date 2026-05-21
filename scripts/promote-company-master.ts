import "dotenv/config";

import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { DEFAULT_PROMOTION_THRESHOLDS } from "../src/lib/company-promotion";
import { failIngestRun, finishIngestRun, startIngestRun } from "./lib/data-ingest";

type Args = {
  dryRun: boolean;
  limit: number | null;
  minCases: number;
  minScore: number;
};

type PromotionCandidate = {
  companyMasterId: string;
  name: string;
  normKey: string;
  ticker: string | null;
  cik: string | null;
  sectorKey: string | null;
  distinctCases: bigint;
  autoAcceptedHighMatches: bigint;
  maxScore: number;
};

type LinkRow = {
  companyId: string;
  caseId: string;
  role: string;
  rawParty: string;
};

function parseArgs(): Args {
  const args: Args = {
    dryRun: false,
    limit: null,
    minCases: DEFAULT_PROMOTION_THRESHOLDS.minDistinctCases,
    minScore: DEFAULT_PROMOTION_THRESHOLDS.minScore,
  };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--min-cases") args.minCases = Number(argv[++i]);
    else if (arg === "--min-score") args.minScore = Number(argv[++i]);
  }
  if (args.limit != null && (!Number.isFinite(args.limit) || args.limit <= 0)) args.limit = null;
  if (!Number.isFinite(args.minCases) || args.minCases <= 0) args.minCases = DEFAULT_PROMOTION_THRESHOLDS.minDistinctCases;
  if (!Number.isFinite(args.minScore) || args.minScore <= 0) args.minScore = DEFAULT_PROMOTION_THRESHOLDS.minScore;
  return args;
}

async function linkExactExistingCompanies() {
  const linked = await prisma.$executeRaw`
    UPDATE companies c
    SET "companyMasterId" = cm.id
    FROM company_master cm
    WHERE c."companyMasterId" IS NULL
      AND (
        (c.cik IS NOT NULL AND cm.cik IS NOT NULL AND c.cik = cm.cik)
        OR (c.ticker IS NOT NULL AND cm.ticker IS NOT NULL AND UPPER(c.ticker) = cm.ticker)
        OR c."normKey" = cm."normKey"
      )
  `;
  return Number(linked);
}

async function countExactExistingCompanies() {
  const [summary] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) AS count
    FROM companies c
    JOIN company_master cm
      ON (
        (c.cik IS NOT NULL AND cm.cik IS NOT NULL AND c.cik = cm.cik)
        OR (c.ticker IS NOT NULL AND cm.ticker IS NOT NULL AND UPPER(c.ticker) = cm.ticker)
        OR c."normKey" = cm."normKey"
      )
    WHERE c."companyMasterId" IS NULL
  `;
  return Number(summary.count);
}

async function loadPromotionCandidates(args: Args) {
  const rows = await prisma.$queryRaw<PromotionCandidate[]>`
    WITH candidate_masters AS (
      SELECT
        em."companyMasterId",
        COUNT(DISTINCT op."caseId") AS "distinctCases",
        COUNT(*) FILTER (
          WHERE em."reviewStatus" = 'auto_accepted'
            AND em.confidence = 'high'
            AND em.score >= ${args.minScore}
        ) AS "autoAcceptedHighMatches",
        MAX(em.score) AS "maxScore"
      FROM entity_matches em
      JOIN observed_parties op ON op.id = em."observedPartyId"
      WHERE em."reviewStatus" = 'auto_accepted'
        AND em.confidence = 'high'
        AND em.score >= ${args.minScore}
      GROUP BY em."companyMasterId"
      HAVING COUNT(DISTINCT op."caseId") >= ${args.minCases}
    )
    SELECT
      cm.id AS "companyMasterId",
      cm.name,
      cm."normKey",
      cm.ticker,
      cm.cik,
      cm."sectorKey",
      candidate_masters."distinctCases",
      candidate_masters."autoAcceptedHighMatches",
      candidate_masters."maxScore"
    FROM candidate_masters
    JOIN company_master cm ON cm.id = candidate_masters."companyMasterId"
    LEFT JOIN companies c ON c."companyMasterId" = cm.id
    WHERE c.id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM companies existing
        WHERE existing."normKey" = cm."normKey"
          OR (cm.cik IS NOT NULL AND existing.cik IS NOT NULL AND existing.cik = cm.cik)
          OR (cm.ticker IS NOT NULL AND existing.ticker IS NOT NULL AND UPPER(existing.ticker) = cm.ticker)
      )
    ORDER BY candidate_masters."distinctCases" DESC, candidate_masters."maxScore" DESC, cm.name ASC
  `;
  return args.limit ? rows.slice(0, args.limit) : rows;
}

async function promoteCandidates(candidates: PromotionCandidate[]) {
  if (candidates.length === 0) return 0;
  const result = await prisma.company.createMany({
    data: candidates.map((candidate) => ({
      id: randomUUID(),
      name: candidate.name,
      normKey: candidate.normKey,
      ticker: candidate.ticker,
      cik: candidate.cik,
      sectorKey: candidate.sectorKey,
      sectorSource: candidate.sectorKey ? "company_master" : null,
      sectorConfidence: candidate.sectorKey ? 0.85 : null,
      companyMasterId: candidate.companyMasterId,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

async function loadCaseLinks(minScore: number) {
  return prisma.$queryRaw<LinkRow[]>`
    WITH product_company AS (
      SELECT DISTINCT ON ("companyMasterId")
        id,
        "companyMasterId"
      FROM companies
      WHERE "companyMasterId" IS NOT NULL
      ORDER BY "companyMasterId", "updatedAt" DESC
    )
    SELECT DISTINCT ON (pc.id, op."caseId", op.role)
      pc.id AS "companyId",
      op."caseId",
      COALESCE(NULLIF(op.role, ''), 'other') AS role,
      op."rawName" AS "rawParty"
    FROM entity_matches em
    JOIN observed_parties op ON op.id = em."observedPartyId"
    JOIN product_company pc ON pc."companyMasterId" = em."companyMasterId"
    WHERE em."reviewStatus" = 'auto_accepted'
      AND em.confidence = 'high'
      AND em.score >= ${minScore}
    ORDER BY pc.id, op."caseId", op.role, em.score DESC
  `;
}

async function insertCaseLinks(rows: LinkRow[]) {
  let inserted = 0;
  for (const batch of chunks(rows, 1000)) {
    const result = await prisma.companyCaseLink.createMany({
      data: batch.map((row) => ({
        companyId: row.companyId,
        caseId: row.caseId,
        role: row.role,
        rawParty: row.rawParty,
      })),
      skipDuplicates: true,
    });
    inserted += result.count;
  }
  return inserted;
}

async function backfillObservedPartyCompanyIds(minScore: number) {
  const updated = await prisma.$executeRaw`
    WITH product_company AS (
      SELECT DISTINCT ON ("companyMasterId")
        id,
        "companyMasterId"
      FROM companies
      WHERE "companyMasterId" IS NOT NULL
      ORDER BY "companyMasterId", "updatedAt" DESC
    ),
    best_match AS (
      SELECT DISTINCT ON (em."observedPartyId")
        em."observedPartyId",
        pc.id AS "companyId"
      FROM entity_matches em
      JOIN product_company pc ON pc."companyMasterId" = em."companyMasterId"
      WHERE em."reviewStatus" = 'auto_accepted'
        AND em.confidence = 'high'
        AND em.score >= ${minScore}
      ORDER BY em."observedPartyId", em.score DESC
    )
    UPDATE observed_parties op
    SET "companyId" = best_match."companyId"
    FROM best_match
    WHERE op.id = best_match."observedPartyId"
      AND op."companyId" IS NULL
  `;
  return Number(updated);
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const args = parseArgs();

  if (args.dryRun) {
    const exactLinked = await countExactExistingCompanies();
    const candidates = await loadPromotionCandidates(args);
    console.log(
      `dry run: ${exactLinked} existing companies would be linked; ${candidates.length} master companies eligible for promotion`,
    );
    await prisma.$disconnect();
    return;
  }

  const run = await startIngestRun(prisma, "company_master", "promote_to_companies", args);
  try {
    const exactLinked = await linkExactExistingCompanies();
    const candidates = await loadPromotionCandidates(args);
    const promoted = await promoteCandidates(candidates);
    const linkRows = await loadCaseLinks(args.minScore);
    const caseLinksInserted = await insertCaseLinks(linkRows);
    const observedPartiesLinked = await backfillObservedPartyCompanyIds(args.minScore);

    await finishIngestRun(prisma, run.id, {
      rowsFetched: candidates.length,
      rowsInserted: promoted + caseLinksInserted,
      rowsUpdated: exactLinked + observedPartiesLinked,
      checkpoint: { promotedAt: new Date().toISOString() },
      metadata: {
        promotedCompanies: promoted,
        exactExistingCompaniesLinked: exactLinked,
        caseLinksInserted,
        observedPartiesLinked,
        eligiblePromotionCandidates: candidates.length,
      },
    });

    console.log(
      [
        `company master promotion complete: ${promoted} companies promoted`,
        `${exactLinked} existing companies linked`,
        `${caseLinksInserted} case links inserted`,
        `${observedPartiesLinked} observed parties linked`,
      ].join("; "),
    );
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
