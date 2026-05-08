// Fetch federal civil dockets from CourtListener Search API where any party
// name matches our Russell-1000 set, write JSONL that ingest.ts can consume.
//
// CourtListener requires authentication for all API access (anonymous tier
// removed). Set COURTLISTENER_API_TOKEN in .env or as a GitHub Actions secret.
//
// Usage:
//   npm run fetch:courtlistener -- --out /tmp/dockets.jsonl [--limit 5000]
//
// Resumable-by-default: dedup is by docket_id within a single run. For
// incremental delta runs, schedule weekly and let ingest.ts dedup by sourceId.

// Load .env explicitly — this script doesn't import Prisma, which is the
// usual side-channel that loads .env in our other scripts.
import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

// CourtListener deprecated v3 for new users (2024-2025 rollout). v4 is the
// supported endpoint. Field names in search responses are unchanged across
// the version bump for the keys we read; should v4 drift, the `pick(...)`
// fallbacks below pick up alternate names.
const API_BASE = "https://www.courtlistener.com/api/rest/v4";
const POLITENESS_MS = 250; // wait between requests
const PER_NAME_PAGE_SIZE = 20;
// 50 pages × 20 = up to 1000 dockets per Russell-1000 query term. With 68
// query terms that's a 68K theoretical ceiling; the --limit flag and
// in-run dedup-by-id usually cap actual yield closer to 30-50K.
const PER_NAME_MAX_PAGES = 50;

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

// CourtListener Search API doesn't return party records inline — those live
// behind a separate /parties/ endpoint that costs 1 extra call per docket.
// case_name reliably encodes them in "Plaintiff v. Defendant" format for the
// vast majority of federal civil cases. We parse the names from case_name
// and let looksLikeCompany() in resolve.ts filter out the non-corporate ones.
function parsePartiesFromCaseName(
  caseName: string,
): Array<{ name: string; party_type: string }> {
  const cn = caseName.trim();
  if (!cn) return [];

  // "In re X" / "In the Matter of X" — bankruptcy / probate matters.
  const inRe = /^(?:in re|in the matter of)\s+(.+)/i.exec(cn);
  if (inRe) return [{ name: inRe[1].trim(), party_type: "other" }];

  // "X v. Y" / "X vs. Y" / "X v Y". Word-boundary on both sides; case-
  // insensitive. Splits at most once — "X v. Y v. Z" treats Z as defendant
  // baggage which is fine for our purposes (looksLikeCompany filters it).
  const versus = cn.split(/\s+vs?\.?\s+/i);
  if (versus.length >= 2) {
    const plaintiff = versus[0].trim();
    const defendant = versus
      .slice(1)
      .join(" v. ")
      .replace(/\s+et\s+al\.?$/i, "")
      .trim();
    const out: Array<{ name: string; party_type: string }> = [];
    if (plaintiff) out.push({ name: plaintiff, party_type: "plaintiff" });
    if (defendant) out.push({ name: defendant, party_type: "defendant" });
    return out;
  }

  return [{ name: cn, party_type: "other" }];
}

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
  const caseName = String(pick(r, ["caseName", "case_name"]) ?? "(unnamed)");
  return {
    id,
    case_name: caseName,
    docket_number: pick(r, ["docketNumber", "docket_number"]),
    court: pick(r, ["court"]),
    court_id: pick(r, ["court_id", "court_exact"]),
    date_filed: toIso(pick(r, ["dateFiled", "date_filed"])),
    date_terminated: toIso(pick(r, ["dateTerminated", "date_terminated"])),
    nature_of_suit: pick(r, ["suitNature", "nature_of_suit", "natureOfSuit"]),
    cause: pick(r, ["cause"]),
    assigned_to_str: pick(r, ["assignedTo", "assigned_to_str", "assigned_to"]),
    parties: parsePartiesFromCaseName(caseName),
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
