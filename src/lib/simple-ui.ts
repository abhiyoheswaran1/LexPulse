export type AttentionLevel = "review" | "monitor" | "quiet";

export type AttentionInput = {
  score: number;
  band: string;
  delta7d?: number | null;
  recentCases?: number | null;
  driverTypes?: string[] | null;
};

export type AlertImpactInput = {
  severity: string;
  type: string;
};

export type SectorInput = AttentionInput & {
  sector?: string | null;
  sectorLabel?: string | null;
};

export type SectorSummary = {
  sector: string;
  label: string;
  review: number;
  monitor: number;
  quiet: number;
  total: number;
  level: AttentionLevel;
};

const URGENT_DRIVERS = new Set(["severe_filing", "risk_jump", "case_spike"]);

export function attentionLevel(input: AttentionInput): AttentionLevel {
  const band = input.band.toLowerCase();
  const delta = input.delta7d ?? 0;
  const recent = input.recentCases ?? 0;
  const hasUrgentDriver = (input.driverTypes ?? []).some((type) => URGENT_DRIVERS.has(type));

  if (band === "high" || input.score >= 80 || delta >= 10 || hasUrgentDriver) {
    return "review";
  }

  if (band === "elevated" || band === "moderate" || input.score >= 35 || recent > 0) {
    return "monitor";
  }

  return "quiet";
}

export function attentionLabel(level: AttentionLevel): string {
  switch (level) {
    case "review":
      return "Review now";
    case "monitor":
      return "Monitor";
    case "quiet":
      return "Quiet";
  }
}

export function alertAttentionLevel(input: AlertImpactInput): AttentionLevel {
  if (input.severity === "critical" || input.type === "risk_jump") {
    return "review";
  }

  if (input.severity === "warn" || input.type === "case_spike") {
    return "monitor";
  }

  return "quiet";
}

export function attentionReason(input: AttentionInput): string {
  const delta = input.delta7d ?? 0;
  const recent = input.recentCases ?? 0;
  const drivers = input.driverTypes ?? [];

  if (delta >= 10 && recent > 0) {
    return `Risk rose ${Math.round(delta)} points this week with ${recent} recent ${plural(recent, "case")}.`;
  }

  if (drivers.includes("severe_filing")) {
    return "A severe recent filing is driving the review priority.";
  }

  if (drivers.includes("case_spike")) {
    return "Recent filings are running above the normal baseline.";
  }

  if (input.band.toLowerCase() === "high" || input.score >= 80) {
    return `Score is ${Math.round(input.score)}, putting this company in the high-risk review group.`;
  }

  if (recent > 0) {
    return `${recent} recent ${plural(recent, "case")} keep this company on watch.`;
  }

  return "No urgent score movement or recent filing pressure.";
}

export function summarizeSectors(rows: SectorInput[]): SectorSummary[] {
  const summaries = new Map<string, SectorSummary>();

  for (const row of rows) {
    const sector = row.sector ?? "unclassified";
    const summary =
      summaries.get(sector) ??
      {
        sector,
        label: row.sectorLabel ?? labelFromKey(sector),
        review: 0,
        monitor: 0,
        quiet: 0,
        total: 0,
        level: "quiet" as AttentionLevel,
      };
    const level = attentionLevel(row);
    summary[level] += 1;
    summary.total += 1;
    summary.level = dominantLevel(summary);
    summaries.set(sector, summary);
  }

  return Array.from(summaries.values()).sort((a, b) => {
    const levelDiff = levelRank(b.level) - levelRank(a.level);
    if (levelDiff !== 0) return levelDiff;
    return b.total - a.total;
  });
}

function dominantLevel(summary: SectorSummary): AttentionLevel {
  if (summary.review > 0) return "review";
  if (summary.monitor > 0) return "monitor";
  return "quiet";
}

function levelRank(level: AttentionLevel): number {
  switch (level) {
    case "review":
      return 3;
    case "monitor":
      return 2;
    case "quiet":
      return 1;
  }
}

function labelFromKey(key: string): string {
  return key
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
