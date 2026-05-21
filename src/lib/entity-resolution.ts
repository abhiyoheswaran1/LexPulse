import { normalizeCompanyName } from "@/lib/resolve";

export type MatchCandidate = {
  companyMasterId: string;
  name: string;
  normKey: string;
  ticker: string | null;
  cik: string | null;
  aliases: Array<{
    normKey: string;
    alias: string;
    confidence: number;
  }>;
};

export type EntityMatchResult = {
  companyMasterId: string;
  score: number;
  method: string;
  confidence: "high" | "medium" | "low";
  reviewStatus: "auto_accepted" | "pending" | "ambiguous" | "rejected";
};

const AUTO_ACCEPT_SCORE = 0.92;
const REVIEW_SCORE = 0.72;
const AMBIGUITY_DELTA = 0.03;

export function rankCompanyMatches(rawParty: string, candidates: MatchCandidate[]): EntityMatchResult[] {
  const observed = normalizeCompanyName(rawParty).key;
  if (!observed) return [];

  const ranked = candidates
    .map((candidate) => scoreCandidate(observed, candidate))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const second = ranked[1];
  const isAmbiguous = best && second && best.score >= REVIEW_SCORE && best.score - second.score <= AMBIGUITY_DELTA;

  return ranked.map((match) => {
    if (isAmbiguous && match.score >= best.score - AMBIGUITY_DELTA) {
      return { ...match, reviewStatus: "ambiguous" as const };
    }
    if (match.score >= AUTO_ACCEPT_SCORE) {
      return { ...match, reviewStatus: "auto_accepted" as const };
    }
    if (match.score >= REVIEW_SCORE) {
      return { ...match, reviewStatus: "pending" as const };
    }
    return { ...match, reviewStatus: "rejected" as const };
  });
}

function scoreCandidate(observed: string, candidate: MatchCandidate): Omit<EntityMatchResult, "reviewStatus"> {
  const alias = candidate.aliases.find((entry) => entry.normKey === observed);
  if (alias) {
    return {
      companyMasterId: candidate.companyMasterId,
      score: round(Math.max(0.94, alias.confidence)),
      method: "alias_exact",
      confidence: "high",
    };
  }

  if (candidate.ticker && observed === candidate.ticker.toLowerCase()) {
    return {
      companyMasterId: candidate.companyMasterId,
      score: 0.95,
      method: "ticker_exact",
      confidence: "high",
    };
  }

  if (observed === candidate.normKey) {
    return {
      companyMasterId: candidate.companyMasterId,
      score: 0.96,
      method: "canonical_exact",
      confidence: "high",
    };
  }

  if (observed.startsWith(candidate.normKey + " ") && candidate.normKey.length >= 4) {
    return {
      companyMasterId: candidate.companyMasterId,
      score: 0.84,
      method: "prefix_subsidiary",
      confidence: "medium",
    };
  }

  const overlap = tokenOverlap(observed, candidate.normKey);
  const score = overlap >= 0.67 ? 0.7 : overlap >= 0.4 ? 0.45 : 0.1;
  return {
    companyMasterId: candidate.companyMasterId,
    score,
    method: "token_overlap",
    confidence: score >= REVIEW_SCORE ? "medium" : "low",
  };
}

function tokenOverlap(a: string, b: string): number {
  const left = new Set(a.split(/\s+/).filter((token) => token.length > 2));
  const right = new Set(b.split(/\s+/).filter((token) => token.length > 2));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared++;
  }
  return shared / Math.max(left.size, right.size);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
