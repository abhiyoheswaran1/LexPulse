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

// Marquee Russell-1000 names that may appear in court records without any
// corporate suffix or whitelisted keyword. Without this allowlist, a party
// string of just "Apple" or "Tesla" gets dropped by looksLikeCompany —
// catastrophic for any product demonstrating "real corporate litigation."
//
// Stored as full display names (we normalize at module-load to keys).
// Maintenance posture: add aggressively when missing names cause customer-
// facing misses. This is not load-bearing once we have a real entity-
// resolution model (sub-project A); it's the v0 stopgap.
const KNOWN_COMPANY_NAMES = [
  // Tech
  "Apple", "Microsoft", "Alphabet", "Google", "Meta", "Facebook",
  "Amazon", "Tesla", "Nvidia", "Oracle", "Intel", "IBM", "Cisco",
  "Adobe", "Salesforce", "Netflix", "ServiceNow", "Snowflake", "Workday",
  "Palantir", "Datadog", "MongoDB", "Atlassian", "Shopify", "Square",
  "Stripe", "Coinbase", "Roblox", "Unity", "Twilio", "Okta", "Zoom",
  "Spotify", "Pinterest", "Snap", "Reddit", "X Corp", "Twitter",
  "LinkedIn", "OpenAI", "Anthropic",
  "Uber", "Lyft", "Airbnb", "DoorDash", "Instacart",

  // Healthcare / pharma
  "Pfizer", "Moderna", "Merck", "AbbVie", "Bristol-Myers Squibb",
  "Bristol Myers", "Eli Lilly", "Lilly", "GSK", "GlaxoSmithKline",
  "Roche", "Novartis", "Bayer", "Sanofi", "AstraZeneca",
  "Johnson & Johnson", "Abbott", "Medtronic", "Stryker",
  "UnitedHealth", "CVS", "Cigna", "Humana", "Aetna",
  "Thermo Fisher", "Danaher", "Becton Dickinson",

  // Industrials / aerospace / auto
  "Boeing", "Lockheed Martin", "Northrop Grumman", "Raytheon",
  "General Electric", "Honeywell", "Caterpillar", "Deere",
  "Ford", "General Motors", "Stellantis",
  "Toyota", "Volkswagen", "Hyundai", "Tesla Motors",
  "FedEx", "UPS", "Union Pacific", "Norfolk Southern",

  // Financials
  "JPMorgan", "Citigroup", "Bank of America", "Wells Fargo",
  "Goldman Sachs", "Morgan Stanley", "BlackRock", "Berkshire Hathaway",
  "Visa", "Mastercard", "American Express", "PayPal", "Capital One",
  "Charles Schwab", "Fidelity",

  // Retail / consumer
  "Walmart", "Costco", "Target", "Kroger", "Home Depot", "Lowe's",
  "Best Buy", "Macy's", "Nordstrom",
  "McDonald's", "Starbucks", "Chipotle", "Domino's",
  "Nike", "Adidas", "Lululemon",
  "Coca-Cola", "Pepsi", "PepsiCo",
  "Procter & Gamble", "Colgate-Palmolive", "Unilever",

  // Energy
  "ExxonMobil", "Chevron", "Shell", "BP", "ConocoPhillips",
  "Schlumberger", "Halliburton",

  // Media / telecom
  "Disney", "Walt Disney", "Comcast", "Warner Bros", "Paramount",
  "Sony", "Samsung",
  "Verizon", "AT&T", "T-Mobile",

  // Real estate / utilities
  "Simon Property", "Prologis", "American Tower",
  "NextEra Energy", "Duke Energy", "Southern Company",

  // Materials / chemicals
  "Linde", "DuPont", "Newmont", "Dow",
];

const KNOWN_COMPANY_KEYS = new Set(
  KNOWN_COMPANY_NAMES.map((n) => normalizeCompanyName(n).key).filter((k) => k.length > 0),
);

// Cheap heuristic: a party is a company if it contains a corporate suffix
// OR a strong corporate keyword (Bank, Group, Holdings, Industries, ...)
// OR its normalized form matches a known marquee name.
// Anything matching individual-name / "in re" / "estate of" patterns is
// rejected outright before any positive check.
const NON_COMPANY_RE = /^\s*(doe|john doe|jane doe|j\. doe|in re\b|estate of\b|et al\b)/i;
const CORP_SUFFIX_RE = /\b(inc|corp|llc|ltd|co|company|corporation|incorporated|limited|plc|llp|lp|gmbh|ag|s\.?a\.?|n\.?v\.?)\b\.?/i;
const CORP_KEYWORD_RE = /\b(bank|holdings|group|industries|partners|capital|technologies|systems|labs|pharmaceuticals|biosciences|semiconductor|software|insurance|energy|logistics|airlines|motors|foods|robotics|cloud|financial|media|networks|solutions|services)\b/i;

export function looksLikeCompany(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (NON_COMPANY_RE.test(t)) return false;
  if (CORP_SUFFIX_RE.test(t)) return true;
  if (CORP_KEYWORD_RE.test(t)) return true;
  // Marquee names without any of the above markers (e.g., bare "Apple").
  const { key } = normalizeCompanyName(t);
  if (key && KNOWN_COMPANY_KEYS.has(key)) return true;
  return false;
}

export type Role = "plaintiff" | "defendant" | "other";

export function classifyRole(raw: string): Role {
  const t = raw.toLowerCase();
  if (/(plaintiff|petitioner|appellant)/.test(t)) return "plaintiff";
  if (/(defendant|respondent|appellee)/.test(t)) return "defendant";
  return "other";
}
