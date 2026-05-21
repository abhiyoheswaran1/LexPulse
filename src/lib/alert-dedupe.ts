export type AlertFingerprint = {
  type: string;
  createdAt: Date;
  refs: unknown;
};

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function hasRecentEquivalentAlert(
  existing: AlertFingerprint[],
  candidate: AlertFingerprint,
  windowMs = DEFAULT_WINDOW_MS,
) {
  const candidateKey = fingerprint(candidate.type, candidate.refs);
  return existing.some((alert) => {
    if (alert.type !== candidate.type) return false;
    if (candidate.createdAt.getTime() - alert.createdAt.getTime() > windowMs) return false;
    return fingerprint(alert.type, alert.refs) === candidateKey;
  });
}

function fingerprint(type: string, refs: unknown) {
  const value = typeof refs === "object" && refs !== null ? refs as Record<string, unknown> : {};
  if (type === "case_spike") {
    return `${type}:${value.last30 ?? ""}:${value.baseline ?? ""}`;
  }
  if (type === "risk_jump") {
    return `${type}:${value.from ?? ""}:${value.to ?? ""}`;
  }
  if (type === "new_case") {
    return `${type}:${value.caseId ?? ""}`;
  }
  return `${type}:${JSON.stringify(value, Object.keys(value).sort())}`;
}
