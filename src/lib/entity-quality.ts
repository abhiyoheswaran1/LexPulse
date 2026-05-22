import { normalizeCompanyName } from "@/lib/resolve";

export type DisplayStatus = "visible" | "quarantined" | "merged";

export type EntityQuality = {
  displayStatus: Exclude<DisplayStatus, "merged">;
  reason: string | null;
};

export type MergeCandidate = {
  id: string;
  name: string;
  ticker: string | null;
  cik: string | null;
  caseCount: number;
  scoreCount: number;
  createdAt: Date;
};

const PROCEDURAL_PATTERNS: Array<[RegExp, string]> = [
  [/\binformation associated with\b/i, "procedural_artifact"],
  [/\bfacebook username:/i, "procedural_artifact"],
  [/\buser id number:/i, "procedural_artifact"],
  [/\bstored at premises controlled by\b/i, "procedural_artifact"],
  [/\bsealed search warrant\b/i, "procedural_artifact"],
  [/\bapplication for order commanding\b/i, "procedural_artifact"],
  [/\bnot to notify any person\b/i, "procedural_artifact"],
  [/\bdepartment of the\b/i, "procedural_artifact"],
  [/\b(ip address|email account|apple id|google account)\b/i, "digital_account_artifact"],
];

export function classifyEntityName(name: string | null | undefined): EntityQuality {
  const value = name?.trim();
  if (!value) return { displayStatus: "quarantined", reason: "empty_name" };
  for (const [pattern, reason] of PROCEDURAL_PATTERNS) {
    if (pattern.test(value)) return { displayStatus: "quarantined", reason };
  }
  return { displayStatus: "visible", reason: null };
}

export function isDisplayableEntityName(name: string | null | undefined) {
  return classifyEntityName(name).displayStatus === "visible";
}

export function chooseCanonicalCompany(candidates: MergeCandidate[]): MergeCandidate | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => candidateScore(b) - candidateScore(a) || a.name.length - b.name.length || a.createdAt.getTime() - b.createdAt.getTime())[0];
}

export function shouldMergeCompanyPair(canonical: MergeCandidate, duplicate: MergeCandidate) {
  if (canonical.id === duplicate.id) return false;
  if (canonical.cik && duplicate.cik && canonical.cik === duplicate.cik) return true;
  if (canonical.ticker && duplicate.ticker && canonical.ticker.toLowerCase() === duplicate.ticker.toLowerCase()) return true;

  const canonicalKey = normalizeCompanyName(canonical.name).key;
  const duplicateKey = normalizeCompanyName(duplicate.name).key;
  if (!canonicalKey || !duplicateKey) return false;
  if (canonicalKey === duplicateKey) return true;

  const canonicalTicker = canonical.ticker?.toLowerCase() ?? null;
  const duplicateTicker = duplicate.ticker?.toLowerCase() ?? null;
  if (canonicalTicker && duplicateKey === canonicalTicker) return true;
  if (duplicateTicker && canonicalKey === duplicateTicker) return true;

  const canonicalTokens = tokens(canonicalKey);
  const duplicateTokens = tokens(duplicateKey);
  const [shorter, longer] =
    canonicalTokens.length <= duplicateTokens.length
      ? [canonicalTokens, duplicateTokens]
      : [duplicateTokens, canonicalTokens];

  if (shorter.length >= 2 && shorter.every((token) => longer.includes(token))) return true;

  if (shorter.length === 1) {
    const token = shorter[0];
    const longerSecondToken = longer[1] ?? "";
    return (
      longer[0] === token &&
      ((canonicalTicker && token === canonicalTicker) ||
        (duplicateTicker && token === duplicateTicker) ||
        (token.length >= 5 &&
          !AMBIGUOUS_SINGLE_TOKEN_BRANDS.has(token) &&
          HOLDING_SINGLE_TOKEN_CONTEXT.has(longerSecondToken) &&
          Boolean(canonical.cik || canonical.ticker || duplicate.cik || duplicate.ticker)))
    );
  }

  return false;
}

function candidateScore(candidate: MergeCandidate) {
  const normalized = normalizeCompanyName(candidate.name).key;
  let score = 0;
  if (candidate.cik) score += 10_000;
  if (candidate.ticker) score += 5_000;
  if (normalized.split(/\s+/).length > 1) score += 500;
  score += Math.min(candidate.caseCount, 5_000);
  score += Math.min(candidate.scoreCount, 500);
  return score;
}

const AMBIGUOUS_SINGLE_TOKEN_BRANDS = new Set([
  "general",
  "american",
  "national",
  "united",
  "first",
  "new",
  "global",
  "international",
  "small",
  "banking",
  "department",
]);

const HOLDING_SINGLE_TOKEN_CONTEXT = new Set(["stores", "platforms", "holdings", "group", "energy"]);

function tokens(key: string) {
  return key.split(/\s+/).filter(Boolean);
}
