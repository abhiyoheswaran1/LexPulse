// SEC EDGAR helpers — pure parsing functions. No I/O.
//
// EDGAR endpoints used by the calibration pipeline:
//
//   1. https://www.sec.gov/files/company_tickers.json
//      Public mapping of every SEC-registered ticker to its CIK and
//      registered company title. ~12K entries. Free, no auth, updated
//      ~weekly.
//
//   2. https://data.sec.gov/submissions/CIK<10-digit>.json
//      Per-company filing history. We only care about the "filings.recent"
//      block, which is parallel-array encoded.
//
//   3. https://www.sec.gov/Archives/edgar/data/<cik>/<accession-clean>/<filename>
//      The primary document for a filing. HTML; we strip and excerpt.
//
// All EDGAR requests require a `User-Agent` header naming the requester
// (per SEC's stated rate-limiting policy at sec.gov/os/accessing-edgar-data).

import { normalizeCompanyName } from "./resolve";

// SEC requires a 10-digit zero-padded CIK in submissions URLs.
export function padCik(cik: number | string): string {
  const n = typeof cik === "number" ? cik : parseInt(cik, 10);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`bad cik: ${cik}`);
  return n.toString().padStart(10, "0");
}

// Strip the dashes from a SEC accession number to get the URL-friendly form.
//   "0001628280-24-008534" -> "000162828024008534"
export function accessionNoDashes(accession: string): string {
  return accession.replace(/-/g, "");
}

export type CompanyTickerEntry = {
  cik: string; // 10-digit zero-padded
  ticker: string;
  title: string;
  normKey: string; // normalized name for fuzzy match against our Company table
};

// Parse SEC's company_tickers.json. The file is shaped as
// `{ "0": {cik_str, ticker, title}, "1": {...}, ... }` — keys are arbitrary
// row numbers, not CIKs. We flatten to an array.
export function parseCompanyTickers(raw: unknown): CompanyTickerEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const out: CompanyTickerEntry[] = [];
  for (const v of Object.values(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const row = v as Record<string, unknown>;
    const cikStr = row.cik_str;
    const ticker = row.ticker;
    const title = row.title;
    if (typeof cikStr !== "number" && typeof cikStr !== "string") continue;
    if (typeof ticker !== "string" || !ticker) continue;
    if (typeof title !== "string" || !title) continue;
    let cik: string;
    try {
      cik = padCik(cikStr);
    } catch {
      continue;
    }
    const { key } = normalizeCompanyName(title);
    if (!key) continue;
    out.push({ cik, ticker: ticker.toUpperCase(), title, normKey: key });
  }
  return out;
}

export type Submission = {
  accession: string;
  formType: string;
  filedAt: Date;
  primaryDocument: string;
  items: string[];
};

// Parse the parallel-array `filings.recent` block from a submissions JSON.
// SEC encodes recent filings as N parallel arrays where index i across all
// arrays describes one filing. The `items` field is a single comma-separated
// string per filing (because not every form type has items, the field is
// often empty).
export function parseSubmissions(raw: unknown): Submission[] {
  if (!raw || typeof raw !== "object") return [];
  const filings = (raw as { filings?: { recent?: unknown } }).filings;
  if (!filings || typeof filings !== "object") return [];
  const recent = filings.recent;
  if (!recent || typeof recent !== "object") return [];
  const r = recent as Record<string, unknown>;
  const accessions = Array.isArray(r.accessionNumber) ? (r.accessionNumber as unknown[]) : [];
  const forms = Array.isArray(r.form) ? (r.form as unknown[]) : [];
  const dates = Array.isArray(r.filingDate) ? (r.filingDate as unknown[]) : [];
  const docs = Array.isArray(r.primaryDocument) ? (r.primaryDocument as unknown[]) : [];
  const items = Array.isArray(r.items) ? (r.items as unknown[]) : [];

  const n = Math.min(accessions.length, forms.length, dates.length);
  const out: Submission[] = [];
  for (let i = 0; i < n; i++) {
    const accession = accessions[i];
    const form = forms[i];
    const date = dates[i];
    if (typeof accession !== "string" || typeof form !== "string" || typeof date !== "string") continue;
    const filedAt = new Date(date);
    if (Number.isNaN(filedAt.getTime())) continue;
    const primaryDocument = typeof docs[i] === "string" ? (docs[i] as string) : "";
    const itemStr = typeof items[i] === "string" ? (items[i] as string) : "";
    const itemList = itemStr
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    out.push({ accession, formType: form, filedAt, primaryDocument, items: itemList });
  }
  return out;
}

// 8-K items most likely to contain material litigation events. We filter
// excerpts to these so we don't blow up DB rows with quarterly-results boilerplate.
//
// Item meanings (per SEC Form 8-K instructions):
//   1.01 — Entry into Material Definitive Agreement (e.g., settlements)
//   1.02 — Termination of Material Definitive Agreement
//   5.02 — Departure of Directors/Officers (sometimes legal-driven)
//   5.03 — Amendments to Articles or Bylaws
//   8.01 — Other Events (catchall — most litigation announcements live here)
//   7.01 — Regulation FD Disclosure (sometimes used for litigation)
export const LITIGATION_RELEVANT_8K_ITEMS = new Set([
  "1.01",
  "1.02",
  "5.02",
  "5.03",
  "7.01",
  "8.01",
]);

export function isLitigationRelevant8K(items: string[]): boolean {
  for (const it of items) {
    // SEC sometimes formats as "1.01" and sometimes as "Item 1.01"
    const code = it.replace(/^\s*item\s*/i, "").trim();
    if (LITIGATION_RELEVANT_8K_ITEMS.has(code)) return true;
  }
  return false;
}

// Strip HTML to plain text. EDGAR filings are full HTML documents with
// inline styles, table layouts, page headers, and the actual content
// interleaved. We don't need a perfect parse — just text extraction good
// enough to feed the regex classifier.
export function htmlToText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => {
      const code = parseInt(n, 10);
      if (code > 0 && code < 0x10ffff) return String.fromCodePoint(code);
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();
}

// Slice the body text down to a bounded excerpt for storage. We don't store
// full filings — methodology calls for ~10KB caps. We slice to a window
// around the first occurrence of any litigation keyword if one exists, else
// the head of the document.
const LITIGATION_HOTSPOT = /litigation|lawsuit|complaint|settle|judgment|class\s*action|subpoena|wells\s*notice|investigative\s*demand|dismissed|inquiry/i;

export function buildItemTextExcerpt(text: string, maxBytes = 10_000): string {
  if (!text) return "";
  if (text.length <= maxBytes) return text;
  const m = LITIGATION_HOTSPOT.exec(text);
  if (m) {
    const center = m.index;
    const half = Math.floor(maxBytes / 2);
    const start = Math.max(0, center - half);
    const end = Math.min(text.length, start + maxBytes);
    return text.slice(start, end);
  }
  return text.slice(0, maxBytes);
}
