// Entity resolution: party string -> Company.
//
// v1 strategy: deterministic normalization key + exact lookup.
// - Lowercase, strip punctuation, collapse whitespace.
// - Strip common corporate suffixes ("inc", "corp", "llc", "ltd", "co",
//   "company", "limited", "incorporated", "plc", "lp", "llp", "gmbh", "sa").
// - Strip leading "the ".
//
// Two distinct strings collapse to the same normKey iff they represent the
// same company under this normalization. That gives us O(1) merging without
// a fuzzy-match library while still catching the common variants:
//   "Acme Corp."        -> "acme"
//   "ACME CORPORATION"  -> "acme"
//   "Acme, Inc."        -> "acme"
//   "The Acme Company"  -> "acme"
//
// Future: replace with embedding similarity + a confidence threshold; the
// signature of `resolveCompanyKey` is the seam we'd swap.

const SUFFIXES = [
  "incorporated",
  "corporation",
  "company",
  "limited",
  "holdings",
  "group",
  "intl",
  "international",
  "plc",
  "llp",
  "llc",
  "lp",
  "inc",
  "corp",
  "ltd",
  "co",
  "sa",
  "ag",
  "gmbh",
  "nv",
  "bv",
];

const SUFFIX_RE = new RegExp(`\\b(${SUFFIXES.join("|")})\\b\\.?`, "gi");

export function normalizeCompanyName(raw: string): {
  display: string;
  key: string;
} {
  const display = raw.replace(/\s+/g, " ").trim();
  const key = display
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(SUFFIX_RE, " ")
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return { display, key };
}

// Cheap heuristic: a party is a company if it contains a corporate suffix
// OR a strong corporate keyword (Bank, Group, Holdings, Industries, ...).
// Anything else (incl. plain "John Doe", "Doe et al.") is treated as not a
// company. Imperfect — but the alternative (treating every party as a company)
// pollutes the company table with individuals.
const CORP_SUFFIX_RE = /\b(inc|corp|llc|ltd|co|company|corporation|incorporated|plc|llp|lp|gmbh|s\.?a\.?|n\.?v\.?)\b\.?/i;
const CORP_KEYWORD_RE = /\b(bank|holdings|group|industries|partners|capital|technologies|systems|labs|pharmaceuticals|biosciences|semiconductor|software|insurance|energy|logistics|airlines|motors|foods|robotics|cloud|financial|media|networks|solutions|services)\b/i;

export function looksLikeCompany(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (CORP_SUFFIX_RE.test(t)) return true;
  if (CORP_KEYWORD_RE.test(t)) return true;
  return false;
}

export type Role = "plaintiff" | "defendant" | "other";

export function classifyRole(raw: string): Role {
  const t = raw.toLowerCase();
  if (/(plaintiff|petitioner|appellant)/.test(t)) return "plaintiff";
  if (/(defendant|respondent|appellee)/.test(t)) return "defendant";
  return "other";
}
