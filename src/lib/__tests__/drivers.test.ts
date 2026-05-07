import { describe, it, expect } from "vitest";
import { generateDrivers, type DriverInput } from "../drivers";

const baseInput: DriverInput = {
  curr: { score: 50, recent30: 1, baselineMonthly: 1, topCategory: null, topCategoryShare: 0, topCircuit: null, topCircuitShare: 0, jurisdictionFactor: 1.0 },
  prev: null,
  newCases7d: [],
};

describe("drivers", () => {
  it("returns empty for bland data", () => {
    const drivers = generateDrivers(baseInput);
    expect(drivers.length).toBe(0);
  });

  it("fires risk_jump on +12 delta", () => {
    const drivers = generateDrivers({
      ...baseInput,
      curr: { ...baseInput.curr, score: 62 },
      prev: { ...baseInput.curr, score: 50 },
    });
    expect(drivers.find((d) => d.type === "risk_jump")).toBeDefined();
  });

  it("fires case_spike on 5x baseline", () => {
    const drivers = generateDrivers({
      ...baseInput,
      curr: { ...baseInput.curr, recent30: 6, baselineMonthly: 1.2 },
    });
    expect(drivers.find((d) => d.type === "case_spike")).toBeDefined();
  });

  it("fires severe_filing for high-severity new case", () => {
    const drivers = generateDrivers({
      ...baseInput,
      newCases7d: [{ caseName: "Acme v. SEC", natureOfSuit: "850", dateFiled: new Date("2026-05-01") }],
    });
    expect(drivers.find((d) => d.type === "severe_filing")).toBeDefined();
  });

  it("fires category_concentration when one severe category dominates", () => {
    const drivers = generateDrivers({
      ...baseInput,
      curr: { ...baseInput.curr, topCategory: "employment_labor", topCategoryShare: 0.7 },
    });
    // employment severity is 0.5, threshold is 0.6 — should NOT fire
    expect(drivers.find((d) => d.type === "category_concentration")).toBeUndefined();

    const fires = generateDrivers({
      ...baseInput,
      curr: { ...baseInput.curr, topCategory: "ip_patent", topCategoryShare: 0.7 },
    });
    expect(fires.find((d) => d.type === "category_concentration")).toBeDefined();
  });

  it("fires federal_circuit_focus", () => {
    const drivers = generateDrivers({
      ...baseInput,
      curr: { ...baseInput.curr, topCircuit: "ca9", topCircuitShare: 0.5, jurisdictionFactor: 1.12 },
    });
    expect(drivers.find((d) => d.type === "federal_circuit_focus")).toBeDefined();
  });

  it("fires decay on -12 delta", () => {
    const drivers = generateDrivers({
      ...baseInput,
      curr: { ...baseInput.curr, score: 38 },
      prev: { ...baseInput.curr, score: 50 },
    });
    expect(drivers.find((d) => d.type === "decay")).toBeDefined();
  });

  it("caps at 4 drivers and sorts by weight desc", () => {
    const drivers = generateDrivers({
      curr: { score: 80, recent30: 6, baselineMonthly: 1, topCategory: "ip_patent", topCategoryShare: 0.7, topCircuit: "ca9", topCircuitShare: 0.5, jurisdictionFactor: 1.12 },
      prev: { score: 60, recent30: 1, baselineMonthly: 1, topCategory: null, topCategoryShare: 0, topCircuit: null, topCircuitShare: 0, jurisdictionFactor: 1.0 },
      newCases7d: [{ caseName: "X v. Y", natureOfSuit: "850", dateFiled: new Date("2026-05-01") }],
    });
    expect(drivers.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < drivers.length; i++) {
      expect(drivers[i - 1].weight).toBeGreaterThanOrEqual(drivers[i].weight);
    }
  });
});
