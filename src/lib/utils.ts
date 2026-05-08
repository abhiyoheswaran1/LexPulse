import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Strip HTML tags + decode common entities. CourtListener occasionally
// stores raw HTML in case names (e.g., warning banners like
// `Meta Platforms, Inc. <font color="red">DO NOT DOCKET</font>`); we
// don't want that bleeding into our UI or DB. Aggressive but bounded —
// only handles tags + a few named/numeric entities, no full HTML parse.
const HTML_TAG_RE = /<\/?[a-z][^>]*>/gi;
const HTML_ENTITY_RE = /&(amp|lt|gt|quot|#39|nbsp|#x?[0-9a-f]+);/gi;
const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

// Slugify a case name to match CourtListener's URL convention. Their
// docket URLs are /docket/<id>/<slug>/ and they 404 if the slug is
// missing — a bare /docket/<id>/ does not redirect. The slug is
// alphanumeric + dashes, lowercase, derived from the case name.
//
// Example: "PAYNE v. BEECH-NUT NUTRITION COMPANY"
//   → "payne-v-beech-nut-nutrition-company"
export function slugify(s: string): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

// Build a CourtListener docket URL. Returns null if there's no sourceId.
export function courtListenerUrl(sourceId: string | null, caseName: string | null): string | null {
  if (!sourceId) return null;
  const slug = slugify(caseName ?? "");
  if (!slug) return `https://www.courtlistener.com/docket/${sourceId}/`;
  return `https://www.courtlistener.com/docket/${sourceId}/${slug}/`;
}

export function stripHtml(s: string): string {
  if (!s) return s;
  if (s.indexOf("<") === -1 && s.indexOf("&") === -1) return s;
  return s
    .replace(HTML_TAG_RE, "")
    .replace(HTML_ENTITY_RE, (m) => {
      if (ENTITY_MAP[m.toLowerCase()] != null) return ENTITY_MAP[m.toLowerCase()];
      const numMatch = /^&#(x?)([0-9a-f]+);$/i.exec(m);
      if (numMatch) {
        const code = parseInt(numMatch[2], numMatch[1] ? 16 : 10);
        if (code > 0 && code < 0x10ffff) return String.fromCodePoint(code);
      }
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatRelative(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  const ms = Date.now() - dt.getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function bandColor(band: string): string {
  switch (band) {
    case "high": return "text-bad";
    case "elevated": return "text-elev";
    case "moderate": return "text-warn";
    default: return "text-ok";
  }
}

export function bandBg(band: string): string {
  switch (band) {
    case "high": return "bg-bad/15 text-bad border-bad/30";
    case "elevated": return "bg-elev/15 text-elev border-elev/30";
    case "moderate": return "bg-warn/15 text-warn border-warn/30";
    default: return "bg-ok/15 text-ok border-ok/30";
  }
}
