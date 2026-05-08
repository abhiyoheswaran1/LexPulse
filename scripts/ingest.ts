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
// Round-trip discipline: each batch issues O(1) round-trips per entity type
// (createMany + findMany), not O(N). At 100ms latency to a managed Postgres,
// 500-docket batches finish in ~1s of network time instead of ~250s.
//
// Entity resolution happens inline: each party string runs through
// normalizeCompanyName -> upsert by normKey -> link to case.

import fs from "node:fs";
import readline from "node:readline";
import { prisma } from "../src/lib/db";
import { normalizeCompanyName, looksLikeCompany, classifyRole } from "../src/lib/resolve";
import { stripHtml } from "../src/lib/utils";

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
  if (out.limit !== undefined && Number.isNaN(out.limit)) out.limit = undefined;
  if (Number.isNaN(out.batch) || out.batch <= 0) out.batch = 500;
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

function normalizeCourt(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.toLowerCase().replace(/\./g, "").replace(/\s+/g, "") || null;
}

function rolePartyFromType(party_type: string | undefined): string {
  if (!party_type) return "other";
  if (/plaintiff|petitioner|appellant/i.test(party_type)) return "plaintiff";
  if (/defendant|respondent|appellee/i.test(party_type)) return "defendant";
  return classifyRole(party_type);
}

async function ingestBatch(rows: RawDocket[]) {
  // ---- 1. Collect unique companies + judges across the batch. ----
  type CompanyAccum = { display: string; key: string };
  const companyByKey = new Map<string, CompanyAccum>();
  const judgeNames = new Set<string>();
  for (const d of rows) {
    if (d.assigned_to_str) judgeNames.add(d.assigned_to_str.trim());
    for (const p of d.parties ?? []) {
      const raw = (p.name ?? "").trim();
      if (!raw || !looksLikeCompany(raw)) continue;
      const { display, key } = normalizeCompanyName(raw);
      if (!key) continue;
      if (!companyByKey.has(key)) companyByKey.set(key, { display, key });
    }
  }

  // ---- 2. Bulk-insert new companies + judges, then look up ids. ----
  if (companyByKey.size) {
    await prisma.company.createMany({
      data: [...companyByKey.values()].map((c) => ({
        name: c.display,
        normKey: c.key,
      })),
      skipDuplicates: true,
    });
  }
  const companyRows = companyByKey.size
    ? await prisma.company.findMany({
        where: { normKey: { in: [...companyByKey.keys()] } },
        select: { id: true, normKey: true },
      })
    : [];
  const keyToId = new Map(companyRows.map((c) => [c.normKey, c.id]));

  if (judgeNames.size) {
    await prisma.judge.createMany({
      data: [...judgeNames].map((name) => ({ name })),
      skipDuplicates: true,
    });
  }
  const judgeRows = judgeNames.size
    ? await prisma.judge.findMany({
        where: { name: { in: [...judgeNames] } },
        select: { id: true, name: true },
      })
    : [];
  const judgeIdByName = new Map(judgeRows.map((j) => [j.name, j.id]));

  // ---- 3. Cases: split into new vs existing. ----
  const sourceIds = rows
    .map((r) => (r.id != null ? String(r.id) : null))
    .filter((s): s is string => s != null);
  const existingCases = sourceIds.length
    ? await prisma.case.findMany({
        where: { sourceId: { in: sourceIds } },
        select: { id: true, sourceId: true },
      })
    : [];
  const existingSidSet = new Set(existingCases.map((c) => c.sourceId!));

  // ---- 4. Update existing cases (delta-ingest path; per-row because field
  //         values are per-row). Cold-start ingest skips this entirely. ----
  for (const d of rows) {
    const sid = d.id != null ? String(d.id) : null;
    if (!sid || !existingSidSet.has(sid)) continue;
    const dateTerm = d.date_terminated ? new Date(d.date_terminated) : null;
    const judgeId = d.assigned_to_str
      ? judgeIdByName.get(d.assigned_to_str.trim()) ?? null
      : null;
    await prisma.case.update({
      where: { sourceId: sid },
      data: {
        caseName: stripHtml(d.case_name ?? "") || "(unnamed)",
        dateTerminated: dateTerm,
        natureOfSuit: d.nature_of_suit ?? null,
        judgeId,
      },
    });
  }

  // ---- 5. Insert new cases via createMany. ----
  const newCaseInserts: Array<{
    sourceId: string | null;
    caseName: string;
    court: string | null;
    docketNumber: string | null;
    dateFiled: Date | null;
    dateTerminated: Date | null;
    natureOfSuit: string | null;
    cause: string | null;
    judgeId: string | null;
  }> = [];
  for (const d of rows) {
    const sid = d.id != null ? String(d.id) : null;
    if (sid && existingSidSet.has(sid)) continue;
    const dateFiled = d.date_filed ? new Date(d.date_filed) : null;
    const dateTerm = d.date_terminated ? new Date(d.date_terminated) : null;
    const courtNorm = normalizeCourt(d.court_id ?? d.court);
    const judgeId = d.assigned_to_str
      ? judgeIdByName.get(d.assigned_to_str.trim()) ?? null
      : null;
    newCaseInserts.push({
      sourceId: sid,
      caseName: stripHtml(d.case_name ?? "") || "(unnamed)",
      court: courtNorm,
      docketNumber: d.docket_number ?? null,
      dateFiled,
      dateTerminated: dateTerm,
      natureOfSuit: d.nature_of_suit ?? null,
      cause: d.cause ?? null,
      judgeId,
    });
  }
  if (newCaseInserts.length) {
    await prisma.case.createMany({
      data: newCaseInserts,
      skipDuplicates: true, // belt-and-suspenders for sourceId conflicts
    });
  }

  // ---- 6. Re-fetch case ids (only those with sourceId — we use that to
  //         attach links + events). Cases without sourceId get no links;
  //         that's a known limitation called out in v1 audit. ----
  const allCasesBySid = sourceIds.length
    ? await prisma.case.findMany({
        where: { sourceId: { in: sourceIds } },
        select: { id: true, sourceId: true },
      })
    : [];
  const sidToCaseId = new Map(allCasesBySid.map((c) => [c.sourceId!, c.id]));

  // ---- 7. Filed events — only for newly created cases. Re-ingest is
  //         idempotent because we filter on `existingSidSet`. ----
  const eventRows: Array<{ caseId: string; type: string; occurredAt: Date }> = [];
  for (const d of rows) {
    const sid = d.id != null ? String(d.id) : null;
    if (!sid || existingSidSet.has(sid)) continue;
    if (!d.date_filed) continue;
    const caseId = sidToCaseId.get(sid);
    if (!caseId) continue;
    eventRows.push({
      caseId,
      type: "case_filed",
      occurredAt: new Date(d.date_filed),
    });
  }
  if (eventRows.length) {
    await prisma.event.createMany({ data: eventRows });
  }

  // ---- 8. Links: createMany + skipDuplicates handles re-ingest cleanly. ----
  const linkRows: Array<{
    companyId: string;
    caseId: string;
    role: string;
    rawParty: string;
  }> = [];
  for (const d of rows) {
    const sid = d.id != null ? String(d.id) : null;
    if (!sid) continue;
    const caseId = sidToCaseId.get(sid);
    if (!caseId) continue;
    for (const p of d.parties ?? []) {
      const raw = (p.name ?? "").trim();
      if (!raw || !looksLikeCompany(raw)) continue;
      const { key } = normalizeCompanyName(raw);
      if (!key) continue;
      const companyId = keyToId.get(key);
      if (!companyId) continue;
      linkRows.push({
        companyId,
        caseId,
        role: rolePartyFromType(p.party_type),
        rawParty: raw,
      });
    }
  }
  if (linkRows.length) {
    await prisma.companyCaseLink.createMany({
      data: linkRows,
      skipDuplicates: true,
    });
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
