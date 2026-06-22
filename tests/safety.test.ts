// Tests for lib/safety.ts — pure checklist evaluation logic.
// This file lives in tests/ to match the project's vitest include pattern.
// The canonical source is lib/safety.ts.
import { describe, it, expect } from "vitest";
import {
  evaluateCheck,
  checklistFor,
  COLD_HOLDING_MAX_F,
  type CheckResponse,
} from "@/lib/safety";

describe("checklistFor", () => {
  it("returns FOOD_SAFETY items", () => {
    const items = checklistFor("FOOD_SAFETY");
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.id === "cold-holding-logged")).toBe(true);
  });

  it("returns QUALITY items", () => {
    const items = checklistFor("QUALITY");
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.id === "portion-correct")).toBe(true);
  });
});

describe("evaluateCheck — FOOD_SAFETY", () => {
  const allRequiredOk: CheckResponse[] = [
    { itemId: "cold-holding-logged", ok: true },
    { itemId: "handwashing-gloves",  ok: true },
    { itemId: "labeling-date-mark",  ok: true },
    { itemId: "allergen-separation", ok: true },
  ];

  it("passes when all required items are ok and no temperature provided", () => {
    const verdict = evaluateCheck("FOOD_SAFETY", allRequiredOk);
    expect(verdict.passed).toBe(true);
    expect(verdict.failedRequired).toHaveLength(0);
    expect(verdict.failedReasons).toHaveLength(0);
  });

  it("fails when a required item is missing from responses", () => {
    const partial: CheckResponse[] = [
      { itemId: "cold-holding-logged", ok: true },
      { itemId: "handwashing-gloves",  ok: true },
      // labeling-date-mark omitted
      { itemId: "allergen-separation", ok: true },
    ];
    const verdict = evaluateCheck("FOOD_SAFETY", partial);
    expect(verdict.passed).toBe(false);
    expect(verdict.failedRequired).toContain("labeling-date-mark");
  });

  it("fails when a required item has ok === false", () => {
    const withFail: CheckResponse[] = [
      ...allRequiredOk.filter((r) => r.itemId !== "handwashing-gloves"),
      { itemId: "handwashing-gloves", ok: false },
    ];
    const verdict = evaluateCheck("FOOD_SAFETY", withFail);
    expect(verdict.passed).toBe(false);
    expect(verdict.failedRequired).toContain("handwashing-gloves");
    expect(verdict.failedReasons.some((r) => r.includes("Handwashing"))).toBe(true);
  });

  it("fails with reason when temperature exceeds COLD_HOLDING_MAX_F", () => {
    const verdict = evaluateCheck("FOOD_SAFETY", allRequiredOk, 50);
    expect(verdict.passed).toBe(false);
    expect(verdict.failedRequired).toHaveLength(0); // not a checklist item failure
    expect(verdict.failedReasons.some((r) => r.includes("50°F"))).toBe(true);
    expect(verdict.failedReasons.some((r) => r.includes(`${COLD_HOLDING_MAX_F}°F`))).toBe(true);
  });

  it("passes when temperature is within limit", () => {
    const verdict = evaluateCheck("FOOD_SAFETY", allRequiredOk, 38);
    expect(verdict.passed).toBe(true);
    expect(verdict.failedReasons).toHaveLength(0);
  });

  it("does not fail when temperature is absent", () => {
    const verdict = evaluateCheck("FOOD_SAFETY", allRequiredOk, undefined);
    expect(verdict.passed).toBe(true);
  });

  it("optional item failing does NOT fail the check", () => {
    const withOptionalFail: CheckResponse[] = [
      ...allRequiredOk,
      { itemId: "sanitizer-stocked", ok: false },
    ];
    const verdict = evaluateCheck("FOOD_SAFETY", withOptionalFail);
    expect(verdict.passed).toBe(true);
    expect(verdict.failedRequired).toHaveLength(0);
  });
});

describe("evaluateCheck — QUALITY", () => {
  const allRequiredOk: CheckResponse[] = [
    { itemId: "portion-correct",  ok: true },
    { itemId: "packaging-intact", ok: true },
    { itemId: "presentation-ok",  ok: true },
  ];

  it("passes when all required items are ok", () => {
    const verdict = evaluateCheck("QUALITY", allRequiredOk);
    expect(verdict.passed).toBe(true);
  });

  it("fails when a required item is not ok", () => {
    const withFail: CheckResponse[] = [
      { itemId: "portion-correct",  ok: true },
      { itemId: "packaging-intact", ok: false },
      { itemId: "presentation-ok",  ok: true },
    ];
    const verdict = evaluateCheck("QUALITY", withFail);
    expect(verdict.passed).toBe(false);
    expect(verdict.failedRequired).toContain("packaging-intact");
  });

  it("optional item failing does NOT fail a QUALITY check", () => {
    const withOptionalFail: CheckResponse[] = [
      ...allRequiredOk,
      { itemId: "temp-at-pack", ok: false },
    ];
    const verdict = evaluateCheck("QUALITY", withOptionalFail);
    expect(verdict.passed).toBe(true);
  });

  it("temperature over limit is ignored for QUALITY checks", () => {
    // QUALITY checks don't enforce the cold-holding rule
    const verdict = evaluateCheck("QUALITY", allRequiredOk, 99);
    expect(verdict.passed).toBe(true);
  });
});
