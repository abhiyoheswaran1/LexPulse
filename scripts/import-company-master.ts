import "dotenv/config";

import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { prisma } from "../src/lib/db";
import {
  aliasesForCompany,
  normalizeCik,
  normalizeExchange,
  normalizeTicker,
  parseSecCompanyTickersExchange,
  universeTagsFromRow,
  type CompanyMasterImport,
} from "../src/lib/company-master";
import { normalizeCompanyName } from "../src/lib/resolve";
import { failIngestRun, finishIngestRun, startIngestRun } from "./lib/data-ingest";

const SEC_EXCHANGE_URL = "https://www.sec.gov/files/company_tickers_exchange.json";

type Args = {
  secUrl: string;
  skipSec: boolean;
  universeFile: string | null;
  limit: number | null;
};

function parseArgs(): Args {
  const args: Args = { secUrl: SEC_EXCHANGE_URL, skipSec: false, universeFile: null, limit: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--sec-url") args.secUrl = argv[++i];
    else if (arg === "--skip-sec") args.skipSec = true;
    else if (arg === "--universe-file") args.universeFile = argv[++i];
    else if (arg === "--limit") args.limit = Number(argv[++i]);
  }
  if (args.limit != null && (!Number.isFinite(args.limit) || args.limit <= 0)) args.limit = null;
  return args;
}

async function fetchSecUniverse(url: string): Promise<CompanyMasterImport[]> {
  const userAgent = process.env.EDGAR_USER_AGENT || "LexPulse Data Refresh contact@example.com";
  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`SEC company universe fetch failed: ${res.status} ${res.statusText}`);
  return parseSecCompanyTickersExchange(await res.json());
}

function readUniverseFile(path: string): CompanyMasterImport[] {
  const rows = parse(fs.readFileSync(path, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>;
  const out: CompanyMasterImport[] = [];
  for (const row of rows) {
    const name = row.name || row.company || row.companyName || row.Name;
    if (!name) continue;
    const ticker = normalizeTicker(row.ticker || row.symbol || row.Ticker);
    const cik = normalizeCik(row.cik || row.CIK);
    const tags = universeTagsFromRow(row);
    if (tags.length === 0) continue;
    const { key } = normalizeCompanyName(name);
    out.push({
      cik,
      name,
      normKey: key,
      ticker,
      exchange: normalizeExchange(row.exchange || row.Exchange),
      source: "universe_import",
      universe: tags,
    });
  }
  return out;
}

const CHUNK = 1000;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function dedupeRows(rows: CompanyMasterImport[]) {
  const seen = new Set<string>();
  const out: CompanyMasterImport[] = [];
  for (const row of rows) {
    const key = row.cik ? `cik:${row.cik}` : row.ticker ? `ticker:${row.ticker}` : `norm:${row.normKey}`;
    if (!row.normKey || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function bulkImportCompanyMasters(rows: CompanyMasterImport[]) {
  let insertedMasters = 0;
  let insertedAliases = 0;
  const sourceUrlByRow = (row: CompanyMasterImport) =>
    row.source === "sec_company_tickers_exchange" ? SEC_EXCHANGE_URL : null;

  for (const batch of chunks(rows)) {
    const result = await prisma.companyMaster.createMany({
      data: batch.map((row) => ({
        name: row.name,
        normKey: row.normKey,
        ticker: row.ticker,
        cik: row.cik,
        exchange: row.exchange,
        source: row.source,
        sourceUrl: sourceUrlByRow(row),
        universe: row.universe,
      })),
      skipDuplicates: true,
    });
    insertedMasters += result.count;
    process.stdout.write(`\rcreated ${insertedMasters.toLocaleString()} company masters`);
  }

  const masters = new Map<string, string>();
  for (const batch of chunks(rows)) {
    const found = await prisma.companyMaster.findMany({
      where: {
        OR: [
          { normKey: { in: batch.map((row) => row.normKey) } },
          { cik: { in: batch.map((row) => row.cik).filter((value): value is string => Boolean(value)) } },
          { ticker: { in: batch.map((row) => row.ticker).filter((value): value is string => Boolean(value)) } },
        ],
      },
      select: { id: true, normKey: true, cik: true, ticker: true },
    });
    for (const master of found) {
      masters.set(`norm:${master.normKey}`, master.id);
      if (master.cik) masters.set(`cik:${master.cik}`, master.id);
      if (master.ticker) masters.set(`ticker:${master.ticker}`, master.id);
    }
  }

  const aliasRows = rows.flatMap((row) => {
    const masterId =
      (row.cik ? masters.get(`cik:${row.cik}`) : null) ??
      (row.ticker ? masters.get(`ticker:${row.ticker}`) : null) ??
      masters.get(`norm:${row.normKey}`);
    if (!masterId) return [];
    return aliasesForCompany({ name: row.name, ticker: row.ticker }).map((alias) => ({
      companyMasterId: masterId,
      alias: alias.alias,
      normKey: alias.normKey,
      source: alias.source,
      confidence: alias.confidence,
    }));
  });

  for (const batch of chunks(aliasRows)) {
    const result = await prisma.companyAlias.createMany({ data: batch, skipDuplicates: true });
    insertedAliases += result.count;
  }

  const linkedCompanies = await prisma.$executeRaw`
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

  return { insertedMasters, insertedAliases, linkedCompanies: Number(linkedCompanies) };
}

async function main() {
  const args = parseArgs();
  const run = await startIngestRun(prisma, "sec", "company_master_import", {
    secUrl: args.secUrl,
    universeFile: args.universeFile,
  });
  try {
    const rows: CompanyMasterImport[] = [];
    if (!args.skipSec) rows.push(...(await fetchSecUniverse(args.secUrl)));
    if (args.universeFile) rows.push(...readUniverseFile(args.universeFile));

    const limited = dedupeRows(args.limit ? rows.slice(0, args.limit) : rows);
    const result = await bulkImportCompanyMasters(limited);

    await finishIngestRun(prisma, run.id, {
      rowsFetched: limited.length,
      rowsInserted: result.insertedMasters,
      rowsUpdated: result.linkedCompanies,
      checkpoint: { importedAt: new Date().toISOString() },
      metadata: { aliasesInserted: result.insertedAliases },
    });
    console.log(
      `\ncompany master import complete: ${result.insertedMasters} masters inserted, ${result.insertedAliases} aliases inserted, ${result.linkedCompanies} existing companies linked`,
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
