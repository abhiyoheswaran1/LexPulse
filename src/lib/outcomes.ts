export type LegalOutcomeClassification = {
  outcomeType: "dismissed" | "settled" | "judgment" | "injunction" | "terminated" | "unknown";
  confidence: number;
  matchedText: string;
};

export type MaterialEventClassification = {
  eventType:
    | "regulatory_complaint"
    | "regulatory_resolution"
    | "settlement_disclosed"
    | "judgment_disclosed"
    | "other_litigation";
  confidence: number;
  matchedText: string;
  amountUsd: string | null;
};

const OUTCOME_PATTERNS: Array<{
  outcomeType: LegalOutcomeClassification["outcomeType"];
  confidence: number;
  pattern: RegExp;
}> = [
  { outcomeType: "dismissed", confidence: 0.9, pattern: /\b(?:dismiss(?:ed|al)|motion to dismiss|with prejudice)\b/i },
  { outcomeType: "settled", confidence: 0.85, pattern: /\b(?:settlement agreement|settled|reached a settlement)\b/i },
  { outcomeType: "judgment", confidence: 0.88, pattern: /\b(?:final judgment|judgment entered|summary judgment)\b/i },
  { outcomeType: "injunction", confidence: 0.86, pattern: /\b(?:injunction|temporary restraining order|permanent injunction)\b/i },
  { outcomeType: "terminated", confidence: 0.4, pattern: /\bterminated\b/i },
];

const MATERIAL_PATTERNS: Array<{
  eventType: MaterialEventClassification["eventType"];
  confidence: number;
  pattern: RegExp;
}> = [
  { eventType: "regulatory_complaint", confidence: 0.85, pattern: /\b(?:filed|commenced).{0,50}\bcomplaint\b/i },
  { eventType: "regulatory_resolution", confidence: 0.8, pattern: /\b(?:final judgment|consent order|civil penalty|settled charges)\b/i },
  { eventType: "settlement_disclosed", confidence: 0.78, pattern: /\b(?:settlement|settled)\b/i },
  { eventType: "judgment_disclosed", confidence: 0.78, pattern: /\bjudgment\b/i },
];

export function classifyLegalOutcome(text: string): LegalOutcomeClassification {
  for (const candidate of OUTCOME_PATTERNS) {
    const match = candidate.pattern.exec(text);
    if (match) {
      return {
        outcomeType: candidate.outcomeType,
        confidence: candidate.confidence,
        matchedText: match[0],
      };
    }
  }
  return { outcomeType: "unknown", confidence: 0, matchedText: "" };
}

export function classifyMaterialEvent(text: string): MaterialEventClassification {
  for (const candidate of MATERIAL_PATTERNS) {
    const match = candidate.pattern.exec(text);
    if (match) {
      return {
        eventType: candidate.eventType,
        confidence: candidate.confidence,
        matchedText: match[0],
        amountUsd: extractAmountUsd(text),
      };
    }
  }
  return {
    eventType: "other_litigation",
    confidence: 0.35,
    matchedText: "",
    amountUsd: extractAmountUsd(text),
  };
}

export function extractAmountUsd(text: string): string | null {
  const match = /\$\s*([0-9]+(?:\.[0-9]+)?)\s*(billion|million|thousand)?/i.exec(text);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  const unit = (match[2] ?? "").toLowerCase();
  const multiplier = unit === "billion" ? 1_000_000_000 : unit === "million" ? 1_000_000 : unit === "thousand" ? 1_000 : 1;
  return (base * multiplier).toFixed(2);
}
