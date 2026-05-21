import "dotenv/config";

import { prisma } from "../src/lib/db";
import { rankCompanyMatches, type MatchCandidate } from "../src/lib/entity-resolution";
import { normalizeCompanyName } from "../src/lib/resolve";
import { failIngestRun, finishIngestRun, startIngestRun } from "./lib/data-ingest";

type Args = {
  limit: number | null;
  backfillOnly: boolean;
};

function parseArgs(): Args {
  const args: Args = { limit: null, backfillOnly: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--limit") args.limit = Number(argv[++i]);
    else if (arg === "--backfill-only") args.backfillOnly = true;
  }
  if (args.limit != null && (!Number.isFinite(args.limit) || args.limit <= 0)) args.limit = null;
  return args;
}

async function backfillObservedParties(limit: number | null) {
  const links = await prisma.companyCaseLink.findMany({
    take: limit ?? undefined,
    select: {
      caseId: true,
      companyId: true,
      rawParty: true,
      role: true,
    },
  });
  const rows = links.map((link) => ({
    caseId: link.caseId,
    companyId: link.companyId,
    source: "existing_company_case_link",
    rawName: link.rawParty,
    normKey: normalizeCompanyName(link.rawParty).key,
    role: link.role,
  }));
  if (rows.length > 0) {
    await prisma.observedParty.createMany({
      data: rows.filter((row) => row.normKey),
      skipDuplicates: true,
    });
  }
  return rows.length;
}

async function loadCandidates(): Promise<MatchCandidate[]> {
  const rows = await prisma.companyMaster.findMany({
    include: {
      aliases: {
        select: {
          normKey: true,
          alias: true,
          confidence: true,
        },
      },
    },
  });
  return rows.map((row) => ({
    companyMasterId: row.id,
    name: row.name,
    normKey: row.normKey,
    ticker: row.ticker,
    cik: row.cik,
    aliases: row.aliases,
  }));
}

function buildCandidateIndex(candidates: MatchCandidate[]) {
  const byAlias = new Map<string, MatchCandidate[]>();
  const byHead = new Map<string, MatchCandidate[]>();
  for (const candidate of candidates) {
    const keys = new Set([candidate.normKey, ...candidate.aliases.map((alias) => alias.normKey)]);
    for (const key of keys) {
      const exact = byAlias.get(key) ?? [];
      exact.push(candidate);
      byAlias.set(key, exact);
      const head = key.split(/\s+/)[0];
      if (head && head.length >= 3) {
        const bucket = byHead.get(head) ?? [];
        bucket.push(candidate);
        byHead.set(head, bucket);
      }
    }
  }
  return { byAlias, byHead };
}

async function matchObservedParties(limit: number | null) {
  const candidates = await loadCandidates();
  const index = buildCandidateIndex(candidates);
  const parties = await prisma.observedParty.findMany({
    where: { matches: { none: {} } },
    take: limit ?? undefined,
    orderBy: { createdAt: "asc" },
    select: { id: true, normKey: true, rawName: true, companyId: true },
  });

  const matchRows: Array<{
    observedPartyId: string;
    companyMasterId: string;
    score: number;
    method: string;
    confidence: string;
    reviewStatus: string;
  }> = [];
  const linksByMaster = new Map<string, string[]>();
  for (const party of parties) {
    const head = party.normKey.split(/\s+/)[0];
    const candidatePool = index.byAlias.get(party.normKey) ?? index.byHead.get(head) ?? [];
    if (candidatePool.length === 0) continue;
    const matches = rankCompanyMatches(party.rawName, candidatePool).slice(0, 3);
    for (const match of matches) {
      matchRows.push({
        observedPartyId: party.id,
        companyMasterId: match.companyMasterId,
        score: match.score,
        method: match.method,
        confidence: match.confidence,
        reviewStatus: match.reviewStatus,
      });
    }
    const accepted = matches.find((match) => match.reviewStatus === "auto_accepted");
    if (accepted && party.companyId) {
      const ids = linksByMaster.get(accepted.companyMasterId) ?? [];
      ids.push(party.companyId);
      linksByMaster.set(accepted.companyMasterId, ids);
    }
    if (matchRows.length > 0 && matchRows.length % 10000 === 0) {
      process.stdout.write(`\rprepared ${matchRows.length.toLocaleString()} entity matches`);
    }
  }

  let inserted = 0;
  for (const batch of chunks(matchRows, 1000)) {
    const result = await prisma.entityMatch.createMany({ data: batch, skipDuplicates: true });
    inserted += result.count;
  }

  let linkedCompanies = 0;
  for (const [companyMasterId, ids] of linksByMaster.entries()) {
    for (const batch of chunks([...new Set(ids)], 500)) {
      const result = await prisma.company.updateMany({
        where: { id: { in: batch }, companyMasterId: null },
        data: { companyMasterId },
      });
      linkedCompanies += result.count;
    }
  }

  return { observed: parties.length, inserted, linkedCompanies };
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const args = parseArgs();
  const run = await startIngestRun(prisma, "courtlistener", "entity_match", args);
  try {
    const observed = await backfillObservedParties(args.limit);
    const matchResult = args.backfillOnly ? { observed: 0, inserted: 0, linkedCompanies: 0 } : await matchObservedParties(args.limit);
    await finishIngestRun(prisma, run.id, {
      rowsFetched: observed + matchResult.observed,
      rowsInserted: matchResult.inserted,
      rowsUpdated: matchResult.linkedCompanies,
      checkpoint: { matchedAt: new Date().toISOString() },
    });
    console.log(
      `observed parties backfilled: ${observed}; matches inserted: ${matchResult.inserted}; companies linked: ${matchResult.linkedCompanies}`,
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
