// Bulk fetcher: stream-download CourtListener's bulk dockets archive,
// decompress, parse CSV, filter by Russell-1000 case_name match, emit
// JSONL in the shape that ingest.ts already consumes.
//
// Why this script exists: the REST API has tight per-burst throttles that
// make it impractical to fetch >~1K dockets in a single run without days
// of patient retries. The bulk archive is one large download with no API
// quota — ~5 GB compressed, contains the full federal docket history.
// We only download as much as needed (--limit + early-exit), so a typical
// run streams ~1-2 GB and stops.
//
// Usage:
//   npm run fetch:courtlistener-bulk -- --out /tmp/dockets-bulk.jsonl --limit 100000
//
// Optional --source <url> overrides the autodetected latest bulk file.
// Optional --keep-download retains the .csv.bz2 in /tmp for reuse.

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { parse } from "csv-parse";

const S3_LIST_URL =
  "https://com-courtlistener-storage.s3.us-west-2.amazonaws.com/?list-type=2&prefix=bulk-data/dockets&start-after=bulk-data/dockets-2025";

type Args = { out: string; limit: number; source?: string; keepDownload: boolean };

function parseArgs(): Args {
  const out: Args = { out: "/tmp/dockets-bulk.jsonl", limit: 100000, keepDownload: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out.out = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--source") out.source = argv[++i];
    else if (a === "--keep-download") out.keepDownload = true;
  }
  if (Number.isNaN(out.limit) || out.limit <= 0) out.limit = 100000;
  return out;
}

async function findLatestBulkUrl(): Promise<string> {
  const res = await fetch(S3_LIST_URL);
  if (!res.ok) throw new Error(`S3 list failed: ${res.status}`);
  const xml = await res.text();
  const keys = [...xml.matchAll(/<Key>(bulk-data\/dockets-[^<]+)<\/Key>/g)].map((m) => m[1]);
  if (keys.length === 0) throw new Error("no dockets bulk files in S3 listing");
  // Keys come in lexicographic order; date-suffixed keys sort to the latest.
  const latest = keys[keys.length - 1];
  return `https://com-courtlistener-storage.s3.us-west-2.amazonaws.com/${latest}`;
}

// Russell-1000 match terms — full cleaned names, not single head words.
//
// Earlier head-word extraction produced false positives like "Southern"
// matching "Southern States Offshore" (we wanted Southern Company only).
// The bulk archive is too large to be loose with the regex.
//
// Strategy: strip corp suffixes only, keep the rest of the name, match
// as a contiguous phrase. Single-word distinctive names ("Apple") still
// work, and multi-word names ("Southern Company", "Bank of America")
// require the full phrase — no false positives.
//
// Generic single words ("the", "first", "us") are dropped regardless;
// they'd match millions of unrelated cases.
const GENERIC_SINGLE_WORDS = new Set([
  "the",
  "first",
  "second",
  "third",
  "national",
  "american",
  "us",
  "united",
  "southern",
  "northern",
  "eastern",
  "western",
  "central",
  "general",
  "bank",
  "new",
  "great",
]);

function loadRussellMatchTerms(): string[] {
  const csvPath = path.join(__dirname, "..", "prisma", "seed-sectors.csv");
  const text = fs.readFileSync(csvPath, "utf-8");
  const lines = text.trim().split(/\r?\n/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(",");
    const name = (parts[1] ?? "").trim();
    if (!name) continue;
    // Strip corporate suffixes anywhere in the name and trailing periods.
    const cleaned = name
      .replace(/\b(inc|corp|llc|ltd|company|holdings|group|the|incorporated|plc|llp|lp)\b\.?/gi, " ")
      .replace(/[,.]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;
    // Reject single-word generic prefixes; they'd match millions of cases.
    const tokens = cleaned.split(/\s+/);
    if (tokens.length === 1 && GENERIC_SINGLE_WORDS.has(tokens[0].toLowerCase())) {
      continue;
    }
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function buildRussellRegex(terms: string[]): RegExp {
  // Word-boundary at start and end, whitespace-flex internally so
  // "Bank of America" still matches "Bank  of  America" or with line
  // breaks. Compiled once, applied per row.
  const escaped = terms.map((t) =>
    t
      .split(/\s+/)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+"),
  );
  return new RegExp(`\\b(${escaped.join("|")})\\b`, "i");
}

// Strip HTML tags + decode entities + remove court-clerk admin text that
// CourtListener occasionally embeds in case names. Mirror logic to
// utils.ts stripHtml; kept inline here so the bulk fetcher has zero
// runtime dependency on the Next.js side.
function cleanCaseName(s: string): string {
  if (!s) return s;
  return s
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/gi, (m) => {
      const map: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
      return map[m.toLowerCase()] ?? "";
    })
    .replace(/\b(do not docket|case has been (?:transferred|remanded|electronically transferred)[^.]*\.?)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCaseName(caseName: string): Array<{ name: string; party_type: string }> {
  const cn = cleanCaseName(caseName);
  if (!cn) return [];
  const inRe = /^(?:in re|in the matter of)\s+(.+)/i.exec(cn);
  if (inRe) return [{ name: inRe[1].trim(), party_type: "other" }];
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

function toIso(v: string | undefined | null): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.split("T")[0];
}

type CsvRow = Record<string, string>;

function transform(row: CsvRow) {
  const id = row.id || row.docket_id;
  if (!id) return null;
  const caseName = row.case_name || row.case_name_short || "(unnamed)";
  return {
    id,
    case_name: caseName,
    docket_number: row.docket_number || null,
    court: row.court_id || row.court || null,
    court_id: row.court_id || null,
    date_filed: toIso(row.date_filed),
    date_terminated: toIso(row.date_terminated),
    nature_of_suit: row.nature_of_suit || null,
    cause: row.cause || null,
    assigned_to_str: row.assigned_to_str || null,
    parties: parseCaseName(caseName),
  };
}

async function main() {
  const args = parseArgs();
  const sourceUrl = args.source ?? (await findLatestBulkUrl());
  const terms = loadRussellMatchTerms();
  const RUSSELL = buildRussellRegex(terms);

  console.log(`source: ${sourceUrl}`);
  console.log(`russell terms: ${terms.length} (${terms.slice(0, 5).join(", ")}, …)`);
  console.log(`limit: ${args.limit.toLocaleString()} matched dockets`);
  console.log(`output: ${args.out}`);
  console.log("");

  // Spawn curl → bunzip2 pipeline. Decompressed CSV streams into the parser.
  const curl = spawn(
    "/usr/bin/curl",
    ["-L", "--silent", "--fail", "--show-error", sourceUrl],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const bunzip = spawn("/usr/bin/bunzip2", ["-c"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  curl.stdout.pipe(bunzip.stdin);

  const parser = parse({
    columns: true,
    skip_records_with_error: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
  });

  const out = fs.createWriteStream(args.out, { flags: "w" });
  let scanned = 0;
  let matched = 0;
  let stopped = false;
  const startedAt = Date.now();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try { curl.kill("SIGTERM"); } catch {}
    try { bunzip.kill("SIGTERM"); } catch {}
    parser.end();
  };

  parser.on("readable", () => {
    let row: CsvRow | null;
    while ((row = parser.read() as CsvRow | null)) {
      scanned++;
      const cn = row.case_name || "";
      if (!cn || !RUSSELL.test(cn)) continue;
      const docket = transform(row);
      if (!docket) continue;
      out.write(JSON.stringify(docket) + "\n");
      matched++;
      if (matched % 1000 === 0) {
        const sec = ((Date.now() - startedAt) / 1000).toFixed(0);
        process.stdout.write(
          `\rscanned ${scanned.toLocaleString()} rows, matched ${matched.toLocaleString()} dockets in ${sec}s`,
        );
      }
      if (matched >= args.limit) {
        stop();
        break;
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    parser.on("end", resolve);
    parser.on("error", (e) => {
      // Pipeline kills can surface as parse errors; only fail if we
      // weren't intentionally stopping.
      if (stopped) resolve();
      else reject(e);
    });
    bunzip.stdout.pipe(parser);
    bunzip.on("error", () => {});
    curl.on("error", () => {});
  });

  out.end();
  const sec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `\ndone — scanned ${scanned.toLocaleString()} rows, matched ${matched.toLocaleString()} dockets in ${sec}s`,
  );
  console.log(`output: ${args.out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
