// Streaming ingestion for CourtListener-style docket JSON.
//
// Accepts:
//   --file <path>         JSONL (newline-delimited JSON, one docket per line)
//                         OR a single JSON array.
//   --limit <n>           cap rows ingested (handy for dev)
//   --batch <n>           insert batch size (default 500)
//
// Memory is bounded: we never materialize the file. JSONL takes the fast
// path (line-by-line). For a JSON array we fall back to a small streaming
// brace-counting parser — adequate for CourtListener exports, which are flat
// arrays of objects.
//
// Entity resolution happens inline: each party string runs through
// normalizeCompanyName -> upsert by normKey -> link to case.

import fs from "node:fs";
import readline from "node:readline";
import { prisma } from "../src/lib/db";
import { normalizeCompanyName, looksLikeCompany, classifyRole } from "../src/lib/resolve";

type RawParty = {
  name?: string;
  party_type?: string; // "plaintiff" | "defendant" | ...
};

type RawDocket = {
  id?: number | string;
  case_name?: string;
  docket_number?: string;
  court?: string;
  court_id?: string;
  date_filed?: string | null;
  date_terminated?: string | null;
  nature_of_suit?: string | null;
  cause?: string | null;
  assigned_to_str?: string | null; // judge name
  parties?: RawParty[];
};

type Args = { file?: string; limit?: number; batch: number };

function parseArgs(argv: string[]): Args {
  const out: Args = { batch: 500 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file") out.file = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--batch") out.batch = Number(argv[++i]);
  }
  return out;
}

async function* iterateJsonl(path: string): AsyncGenerator<RawDocket> {
  const stream = fs.createReadStream(path, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    try {
      yield JSON.parse(t) as RawDocket;
    } catch {
      // skip malformed line
    }
  }
}

async function* iterate(path: string): AsyncGenerator<RawDocket> {
  // Heuristic: peek first non-whitespace char. '[' → JSON array, else JSONL.
  const fd = await fs.promises.open(path, "r");
  const buf = Buffer.alloc(1);
  await fd.read(buf, 0, 1, 0);
  await fd.close();
  if (buf.toString() === "[") {
    // Tiny streaming array parser. Works because CourtListener arrays are
    // flat — top-level is an array of objects with no array-of-arrays nesting
    // at the root.
    const stream = fs.createReadStream(path, { encoding: "utf8" });
    let depth = 0;
    let inString = false;
    let escape = false;
    let chunkBuf = "";
    let started = false;
    for await (const chunk of stream) {
      for (const ch of chunk as string) {
        if (!started) {
          if (ch === "[") started = true;
          continue;
        }
        if (inString) {
          chunkBuf += ch;
          if (escape) escape = false;
          else if (ch === "\\") escape = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') {
          inString = true;
          chunkBuf += ch;
          continue;
        }
        if (ch === "{") {
          depth++;
          chunkBuf += ch;
        } else if (ch === "}") {
          depth--;
          chunkBuf += ch;
          if (depth === 0) {
            const t = chunkBuf.trim();
            if (t) {
              try {
                yield JSON.parse(t) as RawDocket;
              } catch {
                /* skip */
              }
            }
            chunkBuf = "";
          }
        } else if (depth > 0) {
          chunkBuf += ch;
        }
      }
    }
    return;
  }
  yield* iterateJsonl(path);
}

type CompanyAccum = { display: string; key: string };

async function ingestBatch(rows: RawDocket[]) {
  // Pass 1: collect unique companies in this batch.
  const companyByKey = new Map<string, CompanyAccum>();
  type LinkSeed = { sourceId: string | null; rawParty: string; key: string; role: string };
  const linkSeedsByDocket = new Map<string, LinkSeed[]>();

  for (const d of rows) {
    const sid = d.id != null ? String(d.id) : null;
    const seeds: LinkSeed[] = [];
    for (const p of d.parties ?? []) {
      const raw = (p.name ?? "").trim();
      if (!raw || !looksLikeCompany(raw)) continue;
      const { display, key } = normalizeCompanyName(raw);
      if (!key) continue;
      if (!companyByKey.has(key)) companyByKey.set(key, { display, key });
      const role =
        (p.party_type && /plaintiff|petitioner|appellant/i.test(p.party_type) && "plaintiff") ||
        (p.party_type && /defendant|respondent|appellee/i.test(p.party_type) && "defendant") ||
        classifyRole(p.party_type ?? "");
      seeds.push({ sourceId: sid, rawParty: raw, key, role });
    }
    if (sid) linkSeedsByDocket.set(sid, seeds);
  }

  // Upsert companies.
  const keyToId = new Map<string, string>();
  for (const c of companyByKey.values()) {
    const row = await prisma.company.upsert({
      where: { normKey: c.key },
      create: { name: c.display, normKey: c.key },
      update: {},
      select: { id: true },
    });
    keyToId.set(c.key, row.id);
  }

  // Upsert judges.
  const judgeNames = new Set<string>();
  for (const d of rows) {
    if (d.assigned_to_str) judgeNames.add(d.assigned_to_str.trim());
  }
  const judgeIdByName = new Map<string, string>();
  for (const name of judgeNames) {
    const row = await prisma.judge.upsert({
      where: { name },
      create: { name },
      update: {},
      select: { id: true },
    });
    judgeIdByName.set(name, row.id);
  }

  // Upsert cases + links + filed events.
  for (const d of rows) {
    const sid = d.id != null ? String(d.id) : null;
    const dateFiled = d.date_filed ? new Date(d.date_filed) : null;
    const dateTerm = d.date_terminated ? new Date(d.date_terminated) : null;

    const judgeId = d.assigned_to_str ? judgeIdByName.get(d.assigned_to_str.trim()) : null;

    // Upsert by sourceId when we have one; otherwise create unconditionally.
    let caseRow;
    if (sid) {
      caseRow = await prisma.case.upsert({
        where: { sourceId: sid },
        create: {
          sourceId: sid,
          caseName: d.case_name ?? "(unnamed)",
          court: d.court ?? d.court_id ?? null,
          docketNumber: d.docket_number ?? null,
          dateFiled,
          dateTerminated: dateTerm,
          natureOfSuit: d.nature_of_suit ?? null,
          cause: d.cause ?? null,
          judgeId: judgeId ?? null,
        },
        update: {
          caseName: d.case_name ?? "(unnamed)",
          dateTerminated: dateTerm,
          natureOfSuit: d.nature_of_suit ?? null,
          judgeId: judgeId ?? null,
        },
      });
    } else {
      caseRow = await prisma.case.create({
        data: {
          caseName: d.case_name ?? "(unnamed)",
          court: d.court ?? d.court_id ?? null,
          docketNumber: d.docket_number ?? null,
          dateFiled,
          dateTerminated: dateTerm,
          natureOfSuit: d.nature_of_suit ?? null,
          cause: d.cause ?? null,
          judgeId: judgeId ?? null,
        },
      });
    }

    // Filed event.
    if (dateFiled) {
      await prisma.event.create({
        data: { caseId: caseRow.id, type: "case_filed", occurredAt: dateFiled },
      });
    }

    // Links.
    const seeds = sid ? linkSeedsByDocket.get(sid) ?? [] : [];
    for (const s of seeds) {
      const companyId = keyToId.get(s.key);
      if (!companyId) continue;
      try {
        await prisma.companyCaseLink.create({
          data: {
            companyId,
            caseId: caseRow.id,
            role: s.role,
            rawParty: s.rawParty,
          },
        });
      } catch {
        // unique violation = already linked, ignore
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error("Usage: tsx scripts/ingest.ts --file <path> [--limit N] [--batch N]");
    process.exit(1);
  }

  const start = Date.now();
  let count = 0;
  let buffer: RawDocket[] = [];

  for await (const docket of iterate(args.file)) {
    buffer.push(docket);
    count++;
    if (buffer.length >= args.batch) {
      await ingestBatch(buffer);
      buffer = [];
      process.stdout.write(`\ringested ${count} dockets`);
    }
    if (args.limit && count >= args.limit) break;
  }
  if (buffer.length) await ingestBatch(buffer);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\ndone — ${count} dockets in ${elapsed}s`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
