// Seed the Sector table from a static constant + assign Companies via the
// hand-curated CSV. Idempotent: upsert by key.

import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";

const SECTORS: Array<{ key: string; label: string; naicsPrefixes: string[] }> = [
  { key: "energy", label: "Energy", naicsPrefixes: ["21", "486"] },
  { key: "materials", label: "Materials", naicsPrefixes: ["32", "33", "212"] },
  { key: "industrials", label: "Industrials", naicsPrefixes: ["33", "48", "49"] },
  { key: "consumer_discretionary", label: "Consumer Discretionary", naicsPrefixes: ["44", "45", "722", "713"] },
  { key: "consumer_staples", label: "Consumer Staples", naicsPrefixes: ["31", "311", "312", "446", "452"] },
  { key: "healthcare", label: "Health Care", naicsPrefixes: ["62", "325", "334", "446", "524"] },
  { key: "financials", label: "Financials", naicsPrefixes: ["52"] },
  { key: "information_technology", label: "Information Technology", naicsPrefixes: ["334", "511", "541"] },
  { key: "communication_services", label: "Communication Services", naicsPrefixes: ["51", "517", "519"] },
  { key: "utilities", label: "Utilities", naicsPrefixes: ["22"] },
  { key: "real_estate", label: "Real Estate", naicsPrefixes: ["53"] },
];

type Row = { ticker: string; name: string; naicsCode: string; sectorKey: string };

function parseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/);
  const [header, ...rest] = lines;
  const cols = header.split(",");
  return rest
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      // Naive CSV parsing — no quoted commas in the seed file.
      const parts = line.split(",");
      const row: Record<string, string> = {};
      cols.forEach((c, i) => (row[c] = parts[i]));
      return row as unknown as Row;
    });
}

async function main() {
  // 1. Upsert Sector rows.
  for (const s of SECTORS) {
    await prisma.sector.upsert({
      where: { key: s.key },
      update: { label: s.label, naicsPrefixes: s.naicsPrefixes },
      create: s,
    });
  }
  console.log(`upserted ${SECTORS.length} sectors`);

  // 2. Load CSV.
  const csvPath = path.join(__dirname, "..", "prisma", "seed-sectors.csv");
  const text = fs.readFileSync(csvPath, "utf-8");
  const rows = parseCsv(text);
  console.log(`loaded ${rows.length} sector mappings from CSV`);

  // 3. For each row, find a Company by ticker (case-insensitive) and assign sectorKey.
  let assigned = 0;
  let missing = 0;
  for (const row of rows) {
    let company = await prisma.company.findFirst({
      where: { ticker: row.ticker },
    });
    if (!company) {
      const head = row.name.split(/[,\s]/)[0].toLowerCase();
      company = await prisma.company.findFirst({
        where: { name: { startsWith: head, mode: "insensitive" } },
      });
    }
    if (!company) {
      missing++;
      continue;
    }
    await prisma.company.update({
      where: { id: company.id },
      data: {
        ticker: row.ticker,
        naicsCode: row.naicsCode,
        sectorKey: row.sectorKey,
        sectorSource: "russell1000",
        sectorConfidence: 1.0,
      },
    });
    assigned++;
  }
  console.log(`assigned sector to ${assigned} companies, ${missing} unmatched (skipped)`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
