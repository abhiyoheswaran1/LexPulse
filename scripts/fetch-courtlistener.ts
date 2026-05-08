// Fetch federal civil dockets from CourtListener Search API where any party
// name matches our Russell-1000 set, write JSONL that ingest.ts can consume.
//
// Anonymous: 5,000 req/day. Set COURTLISTENER_API_TOKEN for 25,000 req/day.
//
// Usage:
//   npm run fetch:courtlistener -- --out /tmp/dockets.jsonl [--limit 5000]
//
// Resumable-by-default: dedup is by docket_id within a single run. For
// incremental delta runs, schedule weekly and let ingest.ts dedup by sourceId.

import fs from "node:fs";
import path from "node:path";

const API_BASE = "https://www.courtlistener.com/api/rest/v3";
const POLITENESS_MS = 250; // wait between requests
const PER_NAME_PAGE_SIZE = 20;
const PER_NAME_MAX_PAGES = 3; // cap how deep we go for any single name

type Args = { out: string; limit: number };

function parseArgs(): Args {
  const out: Args = { out: "/tmp/dockets.jsonl", limit: 5000 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out.out = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
  }
  if (Number.isNaN(out.limit) || out.limit <= 0) out.limit = 5000;
  return out;
}

// Read company names from prisma/seed-sectors.csv. We use the FIRST WORD of
// each name (e.g., "Apple Inc." → "Apple") as a coarse search query — the
// CourtListener search is fuzzy enough that broader terms catch more hits.
function loadRussellQueryTerms(): string[] {
  const csvPath = path.join(__dirname, "..", "prisma", "seed-sectors.csv");
  const text = fs.readFileSync(csvPath, "utf-8");
  const lines = text.trim().split(/\r?\n/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(",");
    const name = (parts[1] ?? "").trim();
    if (!name) continue;
    // Strip suffixes like "Inc.", "Corp.", commas, periods.
    const head = name
      .replace(/\b(inc|corp|llc|company|holdings|group|the)\b\.?/gi, " ")
      .replace(/[,.]/g, " ")
      .trim()
      .split(/\s+/)[0];
    if (head && head.length >= 3 && !seen.has(head.toLowerCase())) {
      seen.add(head.toLowerCase());
      out.push(head);
    }
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url: string, token: string | undefined): Promise<unknown> {
  const headers: Record<string, string> = {
    "User-Agent": "LexPulse/0.1 (litigation risk scoring; +https://github.com/abhiyoheswaran1/LexPulse)",
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Token ${token}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status === 200) return res.json();
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? 60);
      console.warn(`\nrate limited; sleeping ${retryAfter}s before retry`);
      await sleep(retryAfter * 1000);
      continue;
    }
    if (res.status >= 500) {
      // transient server error, exponential backoff
      const wait = 2 ** attempt * 1000;
      console.warn(`\n${res.status} on ${url}; retrying in ${wait}ms`);
      await sleep(wait);
      continue;
    }
    const body = await res.text().catch(() => "");
    throw new Error(`CourtListener ${res.status} on ${url}: ${body.slice(0, 200)}`);
  }
  throw new Error(`exhausted retries: ${url}`);
}

// Defensive accessor: CourtListener fields drift over time. Try several keys.
function pick<T>(obj: Record<string, unknown>, keys: string[]): T | null {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return null;
}

function toIso(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  // Strip time component if present: "2024-01-15T00:00:00" → "2024-01-15"
  return v.split("T")[0];
}

type RawSearchResult = Record<string, unknown>;

function transformResult(r: RawSearchResult): {
  id: number | string;
  case_name: string;
  docket_number: string | null;
  court: string | null;
  court_id: string | null;
  date_filed: string | null;
  date_terminated: string | null;
  nature_of_suit: string | null;
  cause: string | null;
  assigned_to_str: string | null;
  parties: Array<{ name: string; party_type: string }>;
} | null {
  const id = pick<number | string>(r, ["docket_id", "id"]);
  if (id == null) return null;
  const partyNames = pick<unknown>(r, ["party", "parties"]);
  const parties: Array<{ name: string; party_type: string }> = [];
  if (Array.isArray(partyNames)) {
    for (const pn of partyNames) {
      if (typeof pn === "string" && pn.trim()) {
        parties.push({ name: pn.trim(), party_type: "other" });
      } else if (pn && typeof pn === "object" && "name" in pn) {
        const name = String((pn as { name: unknown }).name ?? "").trim();
        if (name) {
          parties.push({
            name,
            party_type: String((pn as { party_type?: unknown }).party_type ?? "other"),
          });
        }
      }
    }
  }
  return {
    id,
    case_name: String(pick(r, ["caseName", "case_name"]) ?? "(unnamed)"),
    docket_number: pick(r, ["docketNumber", "docket_number"]),
    court: pick(r, ["court"]),
    court_id: pick(r, ["court_id", "court_exact"]),
    date_filed: toIso(pick(r, ["dateFiled", "date_filed"])),
    date_terminated: toIso(pick(r, ["dateTerminated", "date_terminated"])),
    nature_of_suit: pick(r, ["suitNature", "nature_of_suit", "natureOfSuit"]),
    cause: pick(r, ["cause"]),
    assigned_to_str: pick(r, ["assignedTo", "assigned_to_str", "assigned_to"]),
    parties,
  };
}

async function main() {
  const args = parseArgs();
  const token = process.env.COURTLISTENER_API_TOKEN || undefined;
  if (!token) {
    console.error(
      "COURTLISTENER_API_TOKEN is required. CourtListener no longer allows\n" +
        "anonymous API access. Register at https://www.courtlistener.com/sign-up/\n" +
        "then grab the token from https://www.courtlistener.com/profile/api/ and\n" +
        "set it in .env (locally) or as a GitHub Actions secret.",
    );
    process.exit(2);
  }
  const queries = loadRussellQueryTerms();
  console.log(`loaded ${queries.length} unique query terms from Russell-1000 seed`);
  console.log("using COURTLISTENER_API_TOKEN");

  const out = fs.createWriteStream(args.out, { flags: "w" });
  const seen = new Set<string>();
  let written = 0;
  let queryIdx = 0;

  for (const q of queries) {
    queryIdx++;
    if (written >= args.limit) break;

    let url: string | null = `${API_BASE}/search/?q=${encodeURIComponent(`"${q}"`)}&type=r&court__jurisdiction=F&order_by=dateFiled%20desc&page_size=${PER_NAME_PAGE_SIZE}`;
    let pages = 0;

    while (url && pages < PER_NAME_MAX_PAGES && written < args.limit) {
      try {
        const data = (await fetchPage(url, token)) as { results?: RawSearchResult[]; next?: string | null };
        const results = data.results ?? [];
        for (const r of results) {
          if (written >= args.limit) break;
          const docket = transformResult(r);
          if (!docket) continue;
          const key = String(docket.id);
          if (seen.has(key)) continue;
          seen.add(key);
          out.write(JSON.stringify(docket) + "\n");
          written++;
        }
        url = data.next ?? null;
        pages++;
        process.stdout.write(`\rquery ${queryIdx}/${queries.length} "${q}" — total ${written}/${args.limit} dockets`);
        await sleep(POLITENESS_MS);
      } catch (e) {
        console.warn(`\nquery "${q}" page ${pages} failed:`, (e as Error).message);
        break; // skip the rest of this term
      }
    }
  }

  out.end();
  console.log(`\ndone — ${written} dockets written to ${args.out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
