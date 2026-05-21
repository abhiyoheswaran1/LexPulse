import { describe, expect, test } from "vitest";
import {
  alertAttentionLevel,
  attentionLevel,
  attentionLabel,
  attentionReason,
  summarizeSectors,
} from "@/lib/simple-ui";

describe("simple-ui attention helpers", () => {
  test("marks high scores as review now", () => {
    expect(attentionLevel({ score: 86, band: "high", recentCases: 0 })).toBe("review");
    expect(attentionLabel("review")).toBe("Review now");
  });

  test("marks urgent drivers as review even below high score", () => {
    expect(
      attentionLevel({
        score: 64,
        band: "moderate",
        recentCases: 1,
        driverTypes: ["severe_filing"],
      }),
    ).toBe("review");
  });

  test("marks moderate active companies as monitor", () => {
    expect(attentionLevel({ score: 48, band: "moderate", recentCases: 2 })).toBe("monitor");
    expect(attentionLabel("monitor")).toBe("Monitor");
  });

  test("marks low inactive companies as quiet", () => {
    expect(attentionLevel({ score: 12, band: "low", recentCases: 0 })).toBe("quiet");
    expect(attentionLabel("quiet")).toBe("Quiet");
  });

  test("generates deterministic plain-language reasons", () => {
    expect(
      attentionReason({
        score: 72,
        band: "elevated",
        delta7d: 14,
        recentCases: 3,
        driverTypes: ["risk_jump"],
      }),
    ).toBe("Risk rose 14 points this week with 3 recent cases.");
  });

  test("summarizes sectors by attention level", () => {
    const sectors = summarizeSectors([
      { sector: "healthcare", sectorLabel: "Healthcare", score: 90, band: "high", recentCases: 4 },
      { sector: "healthcare", sectorLabel: "Healthcare", score: 45, band: "moderate", recentCases: 1 },
      { sector: "technology", sectorLabel: "Technology", score: 10, band: "low", recentCases: 0 },
    ]);

    expect(sectors).toEqual([
      {
        sector: "healthcare",
        label: "Healthcare",
        review: 1,
        monitor: 1,
        quiet: 0,
        total: 2,
        level: "review",
      },
      {
        sector: "technology",
        label: "Technology",
        review: 0,
        monitor: 0,
        quiet: 1,
        total: 1,
        level: "quiet",
      },
    ]);
  });

  test("groups alerts by investor impact", () => {
    expect(alertAttentionLevel({ severity: "critical", type: "new_case" })).toBe("review");
    expect(alertAttentionLevel({ severity: "info", type: "case_spike" })).toBe("monitor");
    expect(alertAttentionLevel({ severity: "info", type: "new_case" })).toBe("quiet");
  });
});
