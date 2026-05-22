import { normalizeCik, normalizeTicker } from "@/lib/company-master";

export type UniverseConstituent = {
  ticker: string | null;
  name: string | null;
  cik: string | null;
};

export function universeTagForIndex(index: string) {
  const key = index.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key === "sp1500" || key === "standardpoors1500") return "sp1500_import";
  if (key === "russell3000") return "russell3000_import";
  throw new Error(`Unsupported index universe: ${index}`);
}

export function parseUniverseCsvRows(rows: Array<Record<string, string>>): UniverseConstituent[] {
  return rows
    .map((row) => {
      const ticker = normalizeTicker(valueFor(row, ["ticker", "symbol", "Ticker", "Symbol"]));
      const name = valueFor(row, ["name", "company", "companyName", "Name", "Company", "Security"]);
      const cik = normalizeCik(valueFor(row, ["cik", "CIK", "Central Index Key"]));
      return {
        ticker,
        name: name || null,
        cik,
      };
    })
    .filter((row) => row.ticker || row.cik || row.name);
}

function valueFor(row: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = row[key]?.trim();
    if (value) return value;
  }
  return "";
}
