// JS-44 Civil Cover Sheet Nature-of-Suit code taxonomy.
//
// Source: PACER JS-44 — ~80 codes grouped into 12 categories. CourtListener
// preserves both the numeric code and a label string; we accept either.
//
// Severity weights are deterministic and version-stable; changes require
// methodology-doc revision and a score-version bump.

export type NosCategory =
  | "securities"
  | "antitrust"
  | "rico_falseclaims"
  | "ip_patent"
  | "ip_trademark_copyright"
  | "civil_rights"
  | "employment_labor"
  | "products_liability"
  | "environmental"
  | "erisa"
  | "contract"
  | "real_property"
  | "tax"
  | "tort_other"
  | "other";

export const CATEGORY_SEVERITY: Record<NosCategory, number> = {
  securities: 0.95,
  antitrust: 0.9,
  rico_falseclaims: 0.9,
  ip_patent: 0.75,
  ip_trademark_copyright: 0.55,
  civil_rights: 0.7,
  employment_labor: 0.5,
  products_liability: 0.7,
  environmental: 0.6,
  erisa: 0.55,
  contract: 0.35,
  real_property: 0.25,
  tax: 0.3,
  tort_other: 0.4,
  other: 0.3,
};

// JS-44 NOS code → category. Coverage for the most common ~80 civil codes.
export const NOS_CATEGORY: Record<string, NosCategory> = {
  // Contract (110-196)
  "110": "contract", "120": "contract", "130": "contract", "140": "contract",
  "150": "contract", "151": "contract", "152": "contract", "153": "contract",
  "160": "contract", "190": "contract", "195": "contract", "196": "contract",
  // Real property (210-290)
  "210": "real_property", "220": "real_property", "230": "real_property",
  "240": "real_property", "245": "real_property", "290": "real_property",
  // Civil rights / personal injury (310-385) — torts mostly
  "310": "tort_other", "315": "tort_other", "320": "tort_other", "330": "tort_other",
  "340": "tort_other", "345": "tort_other", "350": "tort_other", "355": "tort_other",
  "360": "tort_other", "362": "tort_other",
  "365": "products_liability", "367": "products_liability", "368": "products_liability",
  "370": "tort_other", "371": "tort_other", "375": "rico_falseclaims",
  "376": "rico_falseclaims", "380": "tort_other", "385": "tort_other",
  // Civil rights (440-448)
  "440": "civil_rights", "441": "civil_rights", "442": "civil_rights",
  "443": "civil_rights", "444": "civil_rights", "445": "civil_rights",
  "446": "civil_rights", "448": "civil_rights",
  // Forfeiture / penalty (462-470)
  "462": "tort_other", "465": "tort_other", "470": "rico_falseclaims",
  // Banking / commerce (480-490)
  "480": "tort_other", "490": "tort_other",
  // Securities & antitrust
  "410": "antitrust",
  "850": "securities",
  // IP
  "820": "ip_trademark_copyright",
  "830": "ip_patent",
  "835": "ip_patent",
  "840": "ip_trademark_copyright",
  // Labor / ERISA
  "710": "employment_labor", "720": "employment_labor", "730": "employment_labor",
  "740": "employment_labor", "751": "employment_labor", "790": "employment_labor",
  "791": "erisa",
  // Social security / federal tax (861-895)
  "861": "tort_other", "862": "tort_other", "863": "tort_other",
  "864": "tort_other", "865": "tort_other",
  "870": "tax", "871": "tax",
  "875": "rico_falseclaims",
  "890": "tort_other", "891": "tort_other", "892": "tort_other",
  "893": "environmental", "895": "tort_other",
  // Bankruptcy and other (400s/500s)
  "422": "other", "423": "other", "430": "other",
  // Default catchalls
  "950": "other", "999": "other",
};

// Free-text label fallback. CourtListener occasionally returns a label like
// "Securities Fraud" instead of a numeric code; this catches the common ones
// case-insensitively via substring.
const LABEL_FALLBACK: Array<[RegExp, NosCategory]> = [
  [/securit/i, "securities"],
  [/antitrust/i, "antitrust"],
  [/rico|false claim/i, "rico_falseclaims"],
  [/patent/i, "ip_patent"],
  [/trademark|copyright/i, "ip_trademark_copyright"],
  [/civil right/i, "civil_rights"],
  [/employ|labor|fmla|adea|ada/i, "employment_labor"],
  [/erisa/i, "erisa"],
  [/product.*liab/i, "products_liability"],
  [/environment/i, "environmental"],
  [/contract/i, "contract"],
  [/real prop|land|foreclos/i, "real_property"],
  [/\btax\b/i, "tax"],
  [/tort|injury/i, "tort_other"],
];

export function categorize(nosOrLabel: string | null | undefined): NosCategory {
  if (!nosOrLabel) return "other";
  const trimmed = nosOrLabel.trim();
  if (!trimmed) return "other";
  // Numeric code path
  if (/^\d+$/.test(trimmed) && NOS_CATEGORY[trimmed]) return NOS_CATEGORY[trimmed];
  // Label fallback
  for (const [re, cat] of LABEL_FALLBACK) {
    if (re.test(trimmed)) return cat;
  }
  return "other";
}

export function severityForCategory(cat: NosCategory): number {
  return CATEGORY_SEVERITY[cat];
}

export function severityForNos(nosOrLabel: string | null | undefined): number {
  return severityForCategory(categorize(nosOrLabel));
}
