import { describe, it, expect } from "vitest";
import { courtWeight, courtCircuit, courtLevel } from "../jurisdiction";

describe("jurisdiction", () => {
  it("federal SCOTUS gets highest weight", () => {
    expect(courtWeight("scotus")).toBe(1.15);
  });

  it("federal circuits map to 1.05-1.15 range", () => {
    expect(courtWeight("ca9")).toBe(1.15);
    expect(courtWeight("ca2")).toBe(1.15);
    expect(courtWeight("ca5")).toBe(1.15);
    expect(courtWeight("ca11")).toBe(1.15);
    expect(courtWeight("ca1")).toBeGreaterThanOrEqual(1.05);
    expect(courtWeight("cadc")).toBeGreaterThanOrEqual(1.05);
  });

  it("federal districts default to 1.05", () => {
    expect(courtWeight("nysd")).toBe(1.05);
    expect(courtWeight("cand")).toBe(1.05);
  });

  it("bankruptcy courts weighted lower", () => {
    expect(courtWeight("nysb")).toBe(0.95);
  });

  it("unknown courts return 1.0", () => {
    expect(courtWeight(null)).toBe(1.0);
    expect(courtWeight(undefined)).toBe(1.0);
    expect(courtWeight("")).toBe(1.0);
    expect(courtWeight("nonsense")).toBe(1.0);
  });

  it("courtCircuit derives circuit for federal districts", () => {
    expect(courtCircuit("nysd")).toBe("ca2");
    expect(courtCircuit("cand")).toBe("ca9");
    expect(courtCircuit("dcd")).toBe("cadc");
  });

  it("courtLevel classifies", () => {
    expect(courtLevel("scotus")).toBe("federal");
    expect(courtLevel("ca9")).toBe("federal");
    expect(courtLevel("nysd")).toBe("federal");
    expect(courtLevel("nysb")).toBe("federal");
    expect(courtLevel("nonsense")).toBe("unknown");
  });
});
