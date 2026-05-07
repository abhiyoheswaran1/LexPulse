import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
