// Fetches SEC EDGAR 8-K filings for the public-company subset of our
// universe. Two passes:
//
//   1) CIK linkage — download SEC's company_tickers.json and match its
//      ~12K registered companies against our DB by normKey. Sets
//      Company.cik for each match. Idempotent.
//
//   2) Filing backfill — for each company with a CIK, walk
//      data.sec.gov/submissions/CIK<padded>.json, take 8-Ks in the
//      trailing 24 months, fetch the primary document, build an item
//      excerpt, insert SecEdgarFiling. Idempotent on accession number.
//
// Rate limit: 10 req/s self-limited per SEC's stated guideline. Set
// EDGAR_USER_AGENT (required by SEC). All other config is via flags.
//
// Usage:
//   tsx scripts/fetch-edgar-filings.ts --link              # CIK linkage only
//   tsx scripts/fetch-edgar-filings.ts --filings           # 8-K backfill only
//   tsx scripts/fetch-edgar-filings.ts --link --filings    # both
//   tsx scripts/fetch-edgar-filings.ts --filings --since 2024-01-01

import "dotenv/config";
import { prisma } from "../src/lib/db";
import {
  parseCompanyTickers,
  parseSubmissions,
  isLitigationRelevant8K,
  htmlToText,
  buildItemTextExcerpt,
  accessionNoDashes,
} from "../src/lib/edgar";

const USER_AGENT = process.env.EDGAR_USER_AGENT;
if (!USER_AGENT) {
  console.error(
    "EDGAR_USER_AGENT is required (SEC blocks unidentified clients). " +
      'Set in .env, e.g. EDGAR_USER_AGENT="LexPulse Research research@example.com"'
  );
  process.exit(1);
}

const MIN_INTERVAL_MS = 100; // 10 req/s
let lastReq = 0;

async function rateLimited(url: string, init?: RequestInit): Promise<Response> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastReq);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReq = Date.now();
  return fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT!,
      Accept: "application/json,text/html",
      ...(init?.headers ?? {}),
    },
  });
}

type Args = {
  link: boolean;
  filings: boolean;
  since: Date;
  limit: number | null;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = {
    link: false,
    filings: false,
    since: new Date(Date.now() - 730 * 86400 * 1000), // ~24 months
    limit: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--link") out.link = true;
    else if (a === "--filings") out.filings = true;
    else if (a === "--since") out.since = new Date(argv[++i]);
    else if (a === "--limit") out.limit = parseInt(argv[++i], 10);
  }
  if (!out.link && !out.filings) {
    out.link = true;
    out.filings = true;
  }
  return out;
}

async function linkCiks(): Promise<number> {
  console.log("[link] downloading SEC company_tickers.json…");
  const res = await rateLimited("https://www.sec.gov/files/company_tickers.json");
  if (!res.ok) {
    throw new Error(`company_tickers fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const entries = parseCompanyTickers(json);
  console.log(`[link] parsed ${entries.length} ticker entries`);

  // Build lookup by normKey. EDGAR has a few hundred normKey collisions
  // (e.g. shell companies, dual share-class). Prefer the entry whose
  // ticker is shortest — usually the parent.
  const byKey = new Map<string, typeof entries[number]>();
  for (const e of entries) {
    const prev = byKey.get(e.normKey);
    if (!prev || e.ticker.length < prev.ticker.length) {
      byKey.set(e.normKey, e);
    }
  }

  // For every company without a CIK, look it up. Match on normKey OR ticker.
  const companies = await prisma.company.findMany({
    where: { cik: null },
    select: { id: true, normKey: true, ticker: true },
  });
  console.log(`[link] checking ${companies.length} companies without CIK`);

  let linked = 0;
  let collisions = 0;
  for (const c of companies) {
    let match = byKey.get(c.normKey);
    if (!match && c.ticker) {
      const t = c.ticker.toUpperCase();
      match = entries.find((e) => e.ticker === t);
    }
    if (!match) continue;
    try {
      await prisma.company.update({
        where: { id: c.id },
        data: { cik: match.cik },
      });
      linked++;
    } catch (e) {
      // Race or unique-constraint hit (another company already claims this CIK).
      collisions++;
    }
  }
  console.log(`[link] linked ${linked} companies, ${collisions} collisions`);
  return linked;
}

type SecFiling = {
  accession: string;
  formType: string;
  filedAt: Date;
  primaryDocument: string;
  items: string[];
};

async function fetchSubmissions(cik: string): Promise<SecFiling[]> {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const res = await rateLimited(url);
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`submissions ${cik} ${res.status}`);
  }
  const json = await res.json();
  return parseSubmissions(json);
}

async function fetchPrimaryDocText(cik: string, accession: string, doc: string): Promise<string> {
  const accClean = accessionNoDashes(accession);
  // SEC stores primary docs at /Archives/edgar/data/<cik-no-leading-zeros>/<acc-no-dashes>/<filename>
  const cikStripped = cik.replace(/^0+/, "");
  const url = `https://www.sec.gov/Archives/edgar/data/${cikStripped}/${accClean}/${doc}`;
  const res = await rateLimited(url);
  if (!res.ok) return "";
  const html = await res.text();
  return htmlToText(html);
}

async function backfillFilings(since: Date, limit: number | null): Promise<{ filings: number; companies: number }> {
  const companies = await prisma.company.findMany({
    where: { cik: { not: null } },
    select: { id: true, name: true, cik: true },
    orderBy: { name: "asc" },
  });
  console.log(`[filings] ${companies.length} companies with CIK`);

  let totalFilings = 0;
  let touchedCompanies = 0;
  for (let idx = 0; idx < companies.length; idx++) {
    const c = companies[idx];
    if (!c.cik) continue;
    if (limit != null && totalFilings >= limit) break;

    let subs: SecFiling[];
    try {
      subs = await fetchSubmissions(c.cik);
    } catch (e) {
      console.warn(`[filings] ${c.name} (${c.cik}) submissions error:`, (e as Error).message);
      continue;
    }

    const eightKs = subs.filter(
      (s) => s.formType === "8-K" && s.filedAt >= since && isLitigationRelevant8K(s.items)
    );
    if (eightKs.length === 0) continue;

    // Skip ones we already have. Idempotent backfill.
    const existingAccessions = await prisma.secEdgarFiling.findMany({
      where: { companyId: c.id, accession: { in: eightKs.map((f) => f.accession) } },
      select: { accession: true },
    });
    const seen = new Set(existingAccessions.map((e) => e.accession));
    const fresh = eightKs.filter((f) => !seen.has(f.accession));
    if (fresh.length === 0) continue;

    touchedCompanies++;
    let companyAdded = 0;
    for (const f of fresh) {
      if (limit != null && totalFilings >= limit) break;
      let excerpt = "";
      let primaryUrl: string | null = null;
      if (f.primaryDocument) {
        const cikStripped = c.cik.replace(/^0+/, "");
        primaryUrl = `https://www.sec.gov/Archives/edgar/data/${cikStripped}/${accessionNoDashes(f.accession)}/${f.primaryDocument}`;
        try {
          const txt = await fetchPrimaryDocText(c.cik, f.accession, f.primaryDocument);
          excerpt = buildItemTextExcerpt(txt);
        } catch (e) {
          console.warn(`[filings] doc fetch failed for ${f.accession}:`, (e as Error).message);
        }
      }
      try {
        await prisma.secEdgarFiling.create({
          data: {
            companyId: c.id,
            cik: c.cik,
            accession: f.accession,
            formType: f.formType,
            filedAt: f.filedAt,
            items: f.items,
            primaryDocUrl: primaryUrl,
            itemTextExcerpt: excerpt || null,
          },
        });
        totalFilings++;
        companyAdded++;
      } catch (e) {
        // Unique-constraint race (parallel run); ignore.
      }
    }
    if (companyAdded > 0) {
      console.log(
        `[filings] ${idx + 1}/${companies.length} ${c.name}: +${companyAdded} 8-Ks (running total ${totalFilings})`
      );
    }
  }

  return { filings: totalFilings, companies: touchedCompanies };
}

async function main() {
  const args = parseArgs();
  console.log(
    `[edgar] link=${args.link} filings=${args.filings} since=${args.since.toISOString().slice(0, 10)} limit=${args.limit ?? "∞"}`
  );

  if (args.link) {
    await linkCiks();
  }
  if (args.filings) {
    const { filings, companies } = await backfillFilings(args.since, args.limit);
    console.log(`[edgar] inserted ${filings} new 8-K filings across ${companies} companies`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
