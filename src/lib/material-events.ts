// Deterministic regex/keyword classifier for material litigation events
// in 8-K item text. v1 is hand-rules — chosen over an LLM for acquirer
// audit defensibility (same input → same classification, repeatable,
// no model drift).
//
// Each classifier is a small bundle of regex patterns. A filing can fire
// multiple event types. When two patterns of the same eventType fire in
// the same filing, we keep the highest-confidence one.

export type EventType =
  | "litigation_filed"
  | "settlement_disclosed"
  | "judgment_against"
  | "judgment_for"
  | "dismissed"
  | "regulatory_inquiry"
  | "other_litigation";

export type ExtractedEvent = {
  eventType: EventType;
  confidence: number; // 0..1
  snippet: string;    // ~200 char window around the matching phrase
  amountUsd: number | null;
};

type Rule = {
  eventType: EventType;
  // Multiple alternates per rule. Any match fires the eventType. Co-occurrence
  // of multiple rules of the same type is what bumps confidence.
  patterns: RegExp[];
};

// Order matters loosely — earlier rules win ties. We anchor most patterns
// to phrasing that appears in actual 8-K item text. Patterns are case-
// insensitive and tolerant of small word variations.
const RULES: Rule[] = [
  {
    eventType: "settlement_disclosed",
    patterns: [
      // Direct settlement verbiage
      /\bagreed\s+to\s+settle\b/i,
      /\bsettlement\s+agreement\b/i,
      /\bentered\s+into\s+a?\s*settlement\b/i,
      /\bwithout\s+admission\s+of\s+(?:any\s+)?(?:liability|wrongdoing)\b/i,
      /\bpay\b[^.]{0,80}\bin\s+full\s+settlement\b/i,
      // Common 8-K phrasings actually observed in real filings
      /\bfor\s+the\s+settlement\s+of\b/i,
      /\bagreement\s+(?:that\s+)?resolves?\b/i,
      /\bsettle(?:d|ment)\b[^.]{0,80}\b(?:claim|matter|litigation|dispute|allegation|action|proceeding)/i,
      /\breached\s+a?n?\s*agreement\b[^.]{0,80}\b(?:resolve|settle|claim|litigation|matter)/i,
      /\bto\s+resolve\b[^.]{0,80}\b(?:claim|litigation|matter|dispute|action|proceeding)\b/i,
      /\bresolves?\s+(?:all|the)\s+(?:legacy\s+)?(?:claims?|matters?|allegations?|litigation)\b/i,
    ],
  },
  {
    eventType: "judgment_against",
    patterns: [
      /\bjudgment\s+(?:was\s+)?entered\s+against\b/i,
      /\bverdict\s+against\s+the\s+Company\b/i,
      // "ordered the Company to pay" / "ordered to pay" — allow up to 60
      // chars of intervening party name between "ordered" and "to pay".
      /\bordered\b[^.]{0,60}\bto\s+pay\b/i,
      /\bjury\s+returned\s+a\s+verdict\b[^.]{0,80}\bagainst\b/i,
    ],
  },
  {
    eventType: "judgment_for",
    patterns: [
      /\bruled\s+in\s+favor\s+of\s+the\s+Company\b/i,
      /\bsummary\s+judgment\s+(?:was\s+)?(?:granted|entered)\s+(?:in\s+favor\s+of|for)\s+the\s+Company\b/i,
      /\bdismissed\s+with\s+prejudice\b/i,
      /\bjury\s+returned\s+a\s+verdict\b[^.]{0,80}\bin\s+favor\s+of\s+the\s+Company\b/i,
    ],
  },
  {
    eventType: "dismissed",
    patterns: [
      /\bcase\s+(?:was\s+)?dismissed\b/i,
      /\bclaims?\s+(?:were|was)\s+dismissed\b/i,
      /\bmotion\s+to\s+dismiss\s+(?:was\s+)?granted\b/i,
      /\baction\s+(?:was\s+)?dismissed\b/i,
    ],
  },
  {
    eventType: "regulatory_inquiry",
    patterns: [
      /\breceived\s+a\s+subpoena\b/i,
      /\bcivil\s+investigative\s+demand\b/i,
      /\bWells\s+notice\b/i,
      /\bSEC\s+(?:formal\s+)?investigation\b/i,
      /\bDOJ\s+inquiry\b/i,
      /\bgrand\s+jury\s+subpoena\b/i,
    ],
  },
  {
    eventType: "litigation_filed",
    patterns: [
      /\bfiled\s+a?\s+(?:putative\s+)?class\s+action\b/i,
      /\bcomplaint\s+was\s+filed\b/i,
      /\bfiled\s+a\s+lawsuit\s+against\b/i,
      /\bfiled\s+a\s+complaint\b/i,
      /\bsuit\s+was\s+filed\s+against\b/i,
      /\bnamed\s+as\s+a\s+defendant\b/i,
      /\bcommenced\s+(?:a|an|the)\s+(?:civil\s+)?action\b/i,
      /\bputative\s+class\s+action\s+(?:complaint|lawsuit|was|has)\b/i,
      /\bderivative\s+(?:lawsuit|action|complaint)\b/i,
    ],
  },
  {
    eventType: "other_litigation",
    patterns: [
      /\blegal\s+proceedings?\b/i,
      /\bpending\s+litigation\b/i,
      /\blitigation\s+matter\b/i,
    ],
  },
];

// Dollar amount extraction. Captures common 8-K disclosure phrasings:
//   "$100 million", "$1.5 billion", "approximately $250,000",
//   "$3.2 million in damages"
const AMOUNT_RE = /\$\s?([\d,]+(?:\.\d+)?)\s?(million|billion|thousand|m|b|k)?/gi;

function parseAmount(match: RegExpExecArray): number | null {
  const raw = match[1].replace(/,/g, "");
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  const unit = (match[2] ?? "").toLowerCase();
  let multiplier = 1;
  if (unit === "billion" || unit === "b") multiplier = 1_000_000_000;
  else if (unit === "million" || unit === "m") multiplier = 1_000_000;
  else if (unit === "thousand" || unit === "k") multiplier = 1_000;
  return n * multiplier;
}

// Pick the largest amount in the snippet — usually the headline figure.
// (8-K filings often cite filing fees, court costs, etc. alongside the
// main amount; we want the latter.)
export function extractAmountUsd(snippet: string): number | null {
  let max: number | null = null;
  AMOUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_RE.exec(snippet)) != null) {
    const n = parseAmount(m);
    if (n == null) continue;
    if (max == null || n > max) max = n;
  }
  return max;
}

const SNIPPET_RADIUS = 100;

function snippetAround(text: string, idx: number): string {
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + SNIPPET_RADIUS);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

// Classify a filing's item-text excerpt into 0..N material events.
// Multiple events of different types can coexist. For repeated hits of
// the same type, we keep the first match's snippet but boost confidence
// to 0.9 (multiple co-occurring signals); a lone match is 0.5.
//
// Amount extraction: search a wide paragraph-sized window (1500 chars)
// around the firing pattern, not just the 200-char snippet. 8-K
// filings commonly state the amount sentences away from the verb that
// trips the classifier ("agreed to a settlement to resolve claims..."
// then later "...present value commitment of $210 million...").
export function classifyMaterialEvents(text: string): ExtractedEvent[] {
  if (!text) return [];
  const byType = new Map<EventType, { hits: number; firstIdx: number }>();
  for (const rule of RULES) {
    for (const pat of rule.patterns) {
      pat.lastIndex = 0;
      const m = pat.exec(text);
      if (!m) continue;
      const cur = byType.get(rule.eventType);
      if (!cur) {
        byType.set(rule.eventType, { hits: 1, firstIdx: m.index });
      } else {
        cur.hits++;
        if (m.index < cur.firstIdx) cur.firstIdx = m.index;
      }
    }
  }

  const out: ExtractedEvent[] = [];
  for (const [eventType, { hits, firstIdx }] of byType) {
    const snippet = snippetAround(text, firstIdx);
    const wideWindow = text.slice(
      Math.max(0, firstIdx - 750),
      Math.min(text.length, firstIdx + 750),
    );
    out.push({
      eventType,
      confidence: hits >= 2 ? 0.9 : 0.5,
      snippet,
      amountUsd: extractAmountUsd(wideWindow),
    });
  }
  return out;
}
