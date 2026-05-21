import "dotenv/config";

import { prisma } from "../src/lib/db";
import { classifyRole, normalizeCompanyName } from "../src/lib/resolve";
import { failIngestRun, finishIngestRun, startIngestRun } from "./lib/data-ingest";

const API_BASE = "https://www.courtlistener.com/api/rest/v4";
const POLITENESS_MS = 12_500; // CourtListener free tier commonly enforces 5/min on this endpoint.

type Args = {
  limit: number;
};

function parseArgs(): Args {
  const args: Args = { limit: 250 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") args.limit = Number(argv[++i]);
  }
  if (!Number.isFinite(args.limit) || args.limit <= 0) args.limit = 250;
  return args;
}

type CourtListenerList<T> = {
  results?: T[];
};

type CourtListenerParty = {
  id?: number | string;
  name?: string;
  party_type?: string;
  type?: string;
  docket?: string;
  resource_uri?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url: string) {
  const token = process.env.COURTLISTENER_API_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "LexPulse/0.1 data refresh",
  };
  if (token) headers.Authorization = `Token ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CourtListener ${res.status} on ${url}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchPartiesForDocket(sourceId: string): Promise<CourtListenerParty[]> {
  const docketUri = `/api/rest/v4/dockets/${sourceId}/`;
  const urls = [
    `${API_BASE}/parties/?docket__id=${encodeURIComponent(sourceId)}`,
    `${API_BASE}/parties/?docket=${encodeURIComponent(sourceId)}`,
    `${API_BASE}/parties/?docket=${encodeURIComponent(docketUri)}`,
    `${API_BASE}/parties/?docket=${encodeURIComponent(`${API_BASE}/dockets/${sourceId}/`)}`,
  ];

  for (const url of urls) {
    try {
      const payload = (await fetchJson(url)) as CourtListenerList<CourtListenerParty>;
      const results = payload.results ?? [];
      if (results.length > 0) return results;
    } catch (error) {
      if (error instanceof Error && /429|throttled/i.test(error.message)) throw error;
    }
    await sleep(POLITENESS_MS);
  }
  return [];
}

async function main() {
  const args = parseArgs();
  const run = await startIngestRun(prisma, "courtlistener", "party_enrichment", args);
  try {
    const cases = await prisma.case.findMany({
      where: {
        sourceId: { not: null },
        observedParties: { none: { source: "courtlistener_party_api" } },
      },
      take: args.limit,
      orderBy: { dateFiled: "desc" },
      select: { id: true, sourceId: true },
    });

    let fetched = 0;
    let inserted = 0;
    let failed = 0;
    for (const caseRef of cases) {
      if (!caseRef.sourceId) continue;
      try {
        const parties = await fetchPartiesForDocket(caseRef.sourceId);
        fetched += parties.length;
        if (parties.length > 0) {
          await prisma.observedParty.createMany({
            data: parties
              .map((party) => {
                const rawName = (party.name ?? "").trim();
                const normKey = normalizeCompanyName(rawName).key;
                if (!rawName || !normKey) return null;
                const role = classifyRole(String(party.party_type ?? party.type ?? ""));
                return {
                  caseId: caseRef.id,
                  source: "courtlistener_party_api",
                  sourceId: party.id == null ? null : String(party.id),
                  rawName,
                  normKey,
                  role,
                  metadata: {
                    resource_uri: party.resource_uri ?? null,
                    party_type: party.party_type ?? party.type ?? null,
                  },
                };
              })
              .filter((row): row is NonNullable<typeof row> => row != null),
            skipDuplicates: true,
          });
          inserted += parties.length;
        }
      } catch (error) {
        failed++;
        console.warn(`[parties] ${caseRef.sourceId}:`, error instanceof Error ? error.message : error);
      }
      await sleep(POLITENESS_MS);
    }

    await finishIngestRun(prisma, run.id, {
      rowsFetched: fetched,
      rowsInserted: inserted,
      rowsFailed: failed,
      checkpoint: { enrichedAt: new Date().toISOString(), casesChecked: cases.length },
    });
    console.log(`party enrichment complete: ${cases.length} cases checked, ${inserted} parties inserted, ${failed} failures`);
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
