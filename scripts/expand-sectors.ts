// Bulk-expand sectorKey coverage by fuzzy-matching company names against
// the seed-sectors.csv catalog of Russell-1000 names.
//
// Why: seed-sectors.csv has ~50 ticker→sector mappings. The existing
// seed:sectors script only assigns when the company has a matching ticker
// or exact name. Most production companies are subsidiaries / variants
// (e.g., "Amazon Logistics, Inc." vs "Amazon.com Inc."). They'd never
// pick up a sector via ticker match alone, so 99% of companies have
// sectorKey=NULL → no benchmarks.
//
// This script: for each unsectored company, check if its normKey *starts
// with* any Russell-1000 company's normKey. If so, assign that sector
// with low confidence (sectorSource='fuzzy_prefix'). Skips already-
// sectored rows so the manual mapping stays authoritative.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { normalizeCompanyName } from "../src/lib/resolve";

type SeedRow = { ticker: string; name: string; sectorKey: string };

function loadSeedRows(): SeedRow[] {
  const csvPath = path.join(__dirname, "..", "prisma", "seed-sectors.csv");
  const text = fs.readFileSync(csvPath, "utf-8");
  const lines = text.trim().split(/\r?\n/);
  const out: SeedRow[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(",");
    const [ticker, name, , sectorKey] = parts;
    if (!name || !sectorKey) continue;
    out.push({ ticker: ticker.trim(), name: name.trim(), sectorKey: sectorKey.trim() });
  }
  return out;
}

async function main() {
  const seeds = loadSeedRows();
  console.log(`loaded ${seeds.length} russell-1000 seed rows`);

  // Build a list of (normKey, sectorKey) entries, longest first so longer
  // patterns ('amazon com services', 'apple inc') win over shorter prefix
  // matches ('amazon', 'apple') if both exist. After normalization both
  // typically collapse, but order-by-length keeps things deterministic.
  const patterns = seeds
    .map((s) => ({ key: normalizeCompanyName(s.name).key, sectorKey: s.sectorKey }))
    .filter((p) => p.key.length >= 3)
    .sort((a, b) => b.key.length - a.key.length);

  // Skip patterns that are too generic / short — they over-match.
  const GENERIC = new Set(["the", "us", "usa", "first", "national", "american", "general", "bank"]);
  const safePatterns = patterns.filter((p) => {
    const head = p.key.split(/\s+/)[0];
    return head.length >= 4 && !GENERIC.has(head);
  });
  console.log(`${safePatterns.length} safe match patterns (after filtering short/generic)`);

  // Load all companies without sectorKey.
  const unsectored = await prisma.company.findMany({
    where: { sectorKey: null },
    select: { id: true, normKey: true },
  });
  console.log(`${unsectored.length} companies without sectorKey`);

  let assigned = 0;
  const batches = new Map<string, string[]>(); // sectorKey → companyIds

  for (const co of unsectored) {
    if (!co.normKey) continue;
    const k = co.normKey;
    for (const p of safePatterns) {
      // Match if normKey EQUALS the pattern, or STARTS WITH pattern + space
      // (avoids "adam s apple" matching "apple"). Pattern length must
      // also be >= 4 chars to avoid trivial collisions.
      if (k === p.key || k.startsWith(p.key + " ")) {
        const list = batches.get(p.sectorKey) ?? [];
        list.push(co.id);
        batches.set(p.sectorKey, list);
        assigned++;
        break;
      }
    }
  }

  console.log(`would assign ${assigned} companies across ${batches.size} sectors:`);
  for (const [sk, ids] of batches) console.log(`  ${sk}: ${ids.length}`);

  // Write in chunks to avoid statement-size limits.
  const CHUNK = 500;
  for (const [sectorKey, ids] of batches) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      await prisma.company.updateMany({
        where: { id: { in: chunk } },
        data: { sectorKey, sectorSource: "fuzzy_prefix", sectorConfidence: 0.6 },
      });
    }
  }

  console.log(`done — assigned ${assigned} companies`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
