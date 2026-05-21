import { describe, expect, test } from "vitest";
import { hasRecentEquivalentAlert, type AlertFingerprint } from "@/lib/alert-dedupe";

describe("alert dedupe helpers", () => {
  const now = new Date("2026-05-21T20:00:00.000Z");

  test("dedupes equivalent case spikes inside the freshness window", () => {
    const existing: AlertFingerprint[] = [
      {
        type: "case_spike",
        createdAt: new Date("2026-05-21T10:00:00.000Z"),
        refs: { last30: 9, baseline: 0.4 },
      },
    ];

    expect(
      hasRecentEquivalentAlert(existing, {
        type: "case_spike",
        createdAt: now,
        refs: { last30: 9, baseline: 0.4 },
      }),
    ).toBe(true);
  });

  test("allows changed spike fingerprints and expired alerts", () => {
    const existing: AlertFingerprint[] = [
      {
        type: "case_spike",
        createdAt: new Date("2026-05-21T10:00:00.000Z"),
        refs: { last30: 9, baseline: 0.4 },
      },
      {
        type: "case_spike",
        createdAt: new Date("2026-05-20T10:00:00.000Z"),
        refs: { last30: 12, baseline: 0.4 },
      },
    ];

    expect(
      hasRecentEquivalentAlert(existing, {
        type: "case_spike",
        createdAt: now,
        refs: { last30: 12, baseline: 0.4 },
      }),
    ).toBe(false);
  });

  test("dedupes risk jumps by from and to score", () => {
    const existing: AlertFingerprint[] = [
      {
        type: "risk_jump",
        createdAt: new Date("2026-05-21T19:30:00.000Z"),
        refs: { from: 28, to: 49 },
      },
    ];

    expect(
      hasRecentEquivalentAlert(existing, {
        type: "risk_jump",
        createdAt: now,
        refs: { from: 28, to: 49 },
      }),
    ).toBe(true);
  });
});
