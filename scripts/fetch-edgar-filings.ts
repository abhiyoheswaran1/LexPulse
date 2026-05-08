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
  refresh: boolean;
  since: Date;
  limit: number | null;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = {
    link: false,
    filings: false,
    refresh: false,
    since: new Date(Date.now() - 730 * 86400 * 1000), // ~24 months
    limit: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--link") out.link = true;
    else if (a === "--filings") out.filings = true;
    else if (a === "--refresh") out.refresh = true;
    else if (a === "--since") out.since = new Date(argv[++i]);
    else if (a === "--limit") out.limit = parseInt(argv[++i], 10);
  }
  if (!out.link && !out.filings && !out.refresh) {
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

// Filenames produced by SEC's iXBRL viewer pipeline that we want to skip
// when extracting prose. These are inline financial reports and XBRL
// taxonomy extensions, not human-readable content.
const SKIP_DOC_PATTERNS = [
  /^R\d+\.htm$/i,                  // R1.htm, R2.htm — financial-report renderings
  /^FilingSummary\.xml$/i,
  /^MetaLinks\.json$/i,
  /^Financial_Report\.xlsx$/i,
  /\.xsd$/i,                       // XBRL schema
  /_(def|lab|pre|cal)\.xml$/i,     // XBRL linkbases
  /_htm\.xml$/i,                   // inline-XBRL companion XML
  /-index(?:-headers)?\.html?$/i,  // SEC index files
  /-xbrl\.zip$/i,
  /\.zip$/i,
  /^Show\.js$/i,
  /^report\.css$/i,
  /^image\d/i,
  /\.(jpg|jpeg|png|gif|pdf)$/i,
];

function isProseDoc(name: string): boolean {
  if (!/\.html?$/i.test(name)) return false;
  return !SKIP_DOC_PATTERNS.some((re) => re.test(name));
}

// Fetch the filing's directory index and collect text from every prose
// HTML document inside (cover page + press releases + exhibits). The
// SEC's `primaryDocument` field commonly points at an inline-XBRL cover
// page that strips down to meaningless tag values — we need the
// exhibits for the actual litigation prose.
async function fetchFilingProseText(
  cik: string,
  accession: string,
  primaryDocument: string,
): Promise<string> {
  const cikStripped = cik.replace(/^0+/, "");
  const accClean = accessionNoDashes(accession);
  const baseUrl = `https://www.sec.gov/Archives/edgar/data/${cikStripped}/${accClean}`;
  const indexUrl = `${baseUrl}/index.json`;

  let docNames: string[] = [];
  try {
    const idx = await rateLimited(indexUrl);
    if (idx.ok) {
      const j = (await idx.json()) as { directory?: { item?: { name?: string }[] } };
      const items = j.directory?.item ?? [];
      docNames = items.map((it) => it.name ?? "").filter((n) => n.length > 0);
    }
  } catch {
    // Fall through to primary-doc-only strategy.
  }

  let docsToFetch = docNames.filter(isProseDoc);
  // If we didn't find anything via the index, fall back to the primary doc.
  if (docsToFetch.length === 0 && primaryDocument) {
    docsToFetch = [primaryDocument];
  }
  // SEC bandwidth manners: cap to 4 docs per filing. Largest first heuristic
  // doesn't help without size info; fetch in directory order.
  if (docsToFetch.length > 4) docsToFetch = docsToFetch.slice(0, 4);

  const parts: string[] = [];
  for (const name of docsToFetch) {
    try {
      const res = await rateLimited(`${baseUrl}/${name}`);
      if (!res.ok) continue;
      const html = await res.text();
      const text = htmlToText(html);
      if (text.length > 500) parts.push(text); // skip near-empty XBRL stubs
    } catch {
      continue;
    }
  }
  return parts.join("\n\n");
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
          const txt = await fetchFilingProseText(c.cik, f.accession, f.primaryDocument);
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

// Re-fetches prose for filings already in DB. Use after a fetcher
// regression where stored excerpts are bad. Updates only filings whose
// itemTextExcerpt is null/short or whose excerpt looks like an XBRL
// skeleton ("xmlns" / "us-gaap" tokens dominate).
async function refreshExcerpts(limit: number | null): Promise<number> {
  const all = await prisma.secEdgarFiling.findMany({
    select: { id: true, cik: true, accession: true, primaryDocUrl: true, itemTextExcerpt: true },
  });
  // Heuristic: stale excerpts are short OR contain XBRL fingerprints early.
  const stale = all.filter((f) => {
    const t = f.itemTextExcerpt ?? "";
    if (t.length < 1000) return true;
    const head = t.slice(0, 500).toLowerCase();
    return head.includes("xmlns") || head.includes("us-gaap") || head.includes("xbrl");
  });
  console.log(`[refresh] ${stale.length} of ${all.length} filings need fresh excerpts`);

  let updated = 0;
  for (const f of stale) {
    if (limit != null && updated >= limit) break;
    if (!f.primaryDocUrl) continue;
    // Recover primary document filename from the stored URL.
    const m = /\/([^/]+)$/.exec(f.primaryDocUrl);
    const primaryDocument = m ? m[1] : "";
    if (!primaryDocument) continue;
    try {
      const txt = await fetchFilingProseText(f.cik, f.accession, primaryDocument);
      const excerpt = buildItemTextExcerpt(txt);
      if (excerpt) {
        await prisma.secEdgarFiling.update({
          where: { id: f.id },
          data: { itemTextExcerpt: excerpt },
        });
        updated++;
        if (updated % 25 === 0) console.log(`[refresh] ${updated}/${stale.length}…`);
      }
    } catch (e) {
      // Skip; will pick up on next refresh run.
    }
  }
  console.log(`[refresh] updated ${updated} filings`);
  return updated;
}

async function main() {
  const args = parseArgs();
  console.log(
    `[edgar] link=${args.link} filings=${args.filings} refresh=${args.refresh} ` +
      `since=${args.since.toISOString().slice(0, 10)} limit=${args.limit ?? "∞"}`
  );

  if (args.link) {
    await linkCiks();
  }
  if (args.filings) {
    const { filings, companies } = await backfillFilings(args.since, args.limit);
    console.log(`[edgar] inserted ${filings} new 8-K filings across ${companies} companies`);
  }
  if (args.refresh) {
    await refreshExcerpts(args.limit);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
