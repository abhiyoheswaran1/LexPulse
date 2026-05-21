import { normalizeCompanyName } from "@/lib/resolve";

export type CompanyMasterImport = {
  cik: string | null;
  name: string;
  normKey: string;
  ticker: string | null;
  exchange: string | null;
  source: string;
  universe: string[];
};

export type CompanyAliasInput = {
  name: string;
  ticker?: string | null;
};

export type CompanyAliasImport = {
  alias: string;
  normKey: string;
  source: string;
  confidence: number;
};

type SecExchangePayload = {
  fields?: unknown;
  data?: unknown;
};

export function normalizeTicker(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase().replace(/-/g, ".");
}

export function normalizeExchange(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (upper === "NASDAQ" || upper === "NASD") return "NASDAQ";
  if (upper === "NYSE" || upper === "NEW YORK STOCK EXCHANGE") return "NYSE";
  if (upper === "NYSEAMERICAN" || upper === "NYSE AMERICAN") return "NYSEAMERICAN";
  return upper;
}

export function normalizeCik(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;
  return digits.padStart(10, "0");
}

export function parseSecCompanyTickersExchange(payload: SecExchangePayload): CompanyMasterImport[] {
  if (!Array.isArray(payload.fields) || !Array.isArray(payload.data)) return [];
  const fields = payload.fields.map((field) => String(field));
  const index = (name: string) => fields.findIndex((field) => field.toLowerCase() === name);
  const cikIndex = index("cik");
  const nameIndex = index("name");
  const tickerIndex = index("ticker");
  const exchangeIndex = index("exchange");
  if (cikIndex < 0 || nameIndex < 0) return [];

  const rows: CompanyMasterImport[] = [];
  const seen = new Set<string>();
  for (const rawRow of payload.data) {
    if (!Array.isArray(rawRow)) continue;
    const name = String(rawRow[nameIndex] ?? "").trim();
    if (!name) continue;
    const cik = normalizeCik(rawRow[cikIndex] as string | number | null);
    const ticker = normalizeTicker(String(rawRow[tickerIndex] ?? ""));
    const exchange = normalizeExchange(String(rawRow[exchangeIndex] ?? ""));
    const { key } = normalizeCompanyName(name);
    const dedupeKey = cik ?? ticker ?? key;
    if (!dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    rows.push({
      cik,
      name,
      normKey: key,
      ticker,
      exchange,
      source: "sec_company_tickers_exchange",
      universe: ["sec_listed"],
    });
  }
  return rows;
}

export function aliasesForCompany(input: CompanyAliasInput): CompanyAliasImport[] {
  const aliases = new Map<string, CompanyAliasImport>();
  const add = (alias: string, source: string, confidence: number) => {
    const clean = alias.replace(/\s+/g, " ").trim();
    if (!clean) return;
    const { key } = normalizeCompanyName(clean);
    if (!key) return;
    const mapKey = `${source}:${clean.toLowerCase()}`;
    const prev = aliases.get(mapKey);
    if (!prev || confidence > prev.confidence) {
      aliases.set(mapKey, { alias: clean, normKey: key, source, confidence });
    }
  };

  add(input.name, "canonical_name", 1);

  const suffixStripped = stripCorporateTail(input.name);
  if (suffixStripped !== input.name.trim()) {
    add(suffixStripped, "suffix_stripped", 0.96);
  }

  const ticker = normalizeTicker(input.ticker);
  if (ticker) add(ticker, "ticker", 0.92);

  return [...aliases.values()];
}

export function stripCorporateTail(name: string): string {
  return name
    .replace(/^the\s+/i, "")
    .replace(/\b(incorporated|corporation|corp|company|co|limited|ltd|holdings|group|plc|llc|llp|lp|inc)\b\.?/gi, " ")
    .replace(/[,&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function universeTagsFromRow(row: Record<string, string | null | undefined>): string[] {
  const value = `${row.universe ?? ""} ${row.index ?? ""} ${row.tag ?? ""}`.toLowerCase();
  const tags: string[] = [];
  if (/russell\s*3000|r3000/.test(value)) tags.push("russell3000_import");
  if (/s\s*&?\s*p\s*1500|sp1500|s&p\s*1500/.test(value)) tags.push("sp1500_import");
  if (/watchlist/.test(value)) tags.push("watchlist_import");
  return tags;
}
