import { describe, it, expect } from "vitest";
import {
  mealCostCents,
  mealEcon,
  rollupMargin,
  marginByDimension,
  type MealEconInput,
} from "@/lib/margin";

// A believable MTM meal: $9.50 reimbursement, ~$7.20 total cost.
const mtmMeal: MealEconInput = {
  reimbursementCents: 950,
  costLineItems: [
    { type: "FOOD", amountCents: 380 },
    { type: "LABOR", amountCents: 210 },
    { type: "TRANSPORT", amountCents: 90 },
    { type: "OVERHEAD", amountCents: 40 },
  ],
};

describe("mealCostCents", () => {
  it("sums line items", () => {
    expect(mealCostCents(mtmMeal.costLineItems)).toBe(720);
  });
  it("is 0 for no line items", () => {
    expect(mealCostCents([])).toBe(0);
  });
});

describe("mealEcon", () => {
  it("computes contribution margin = revenue - cost", () => {
    const e = mealEcon(mtmMeal);
    expect(e.revenueCents).toBe(950);
    expect(e.costCents).toBe(720);
    expect(e.marginCents).toBe(230);
    expect(e.marginPct).toBeCloseTo(230 / 950, 6);
  });

  it("breaks cost down by type", () => {
    const e = mealEcon(mtmMeal);
    expect(e.costByType).toEqual({
      FOOD: 380,
      LABOR: 210,
      TRANSPORT: 90,
      OVERHEAD: 40,
    });
  });

  it("handles a negative (underwater) margin", () => {
    const e = mealEcon({
      reimbursementCents: 500,
      costLineItems: [{ type: "FOOD", amountCents: 800 }],
    });
    expect(e.marginCents).toBe(-300);
    expect(e.marginPct).toBeCloseTo(-0.6, 6);
  });

  it("guards against divide-by-zero when revenue is 0", () => {
    const e = mealEcon({
      reimbursementCents: 0,
      costLineItems: [{ type: "FOOD", amountCents: 100 }],
    });
    expect(e.marginPct).toBe(0);
    expect(e.marginCents).toBe(-100);
  });
});

describe("rollupMargin", () => {
  it("totals revenue, cost, and margin across meals", () => {
    const r = rollupMargin([mtmMeal, mtmMeal, mtmMeal]);
    expect(r.mealCount).toBe(3);
    expect(r.revenueCents).toBe(2850);
    expect(r.costCents).toBe(2160);
    expect(r.marginCents).toBe(690);
    expect(r.marginPct).toBeCloseTo(690 / 2850, 6);
    expect(r.costByType.FOOD).toBe(1140);
  });

  it("returns zeros for an empty set without NaN", () => {
    const r = rollupMargin([]);
    expect(r.mealCount).toBe(0);
    expect(r.marginPct).toBe(0);
  });
});

describe("marginByDimension", () => {
  it("groups by key and sorts by descending meal count", () => {
    const meals = [
      { ...mtmMeal, program: "MTM" },
      { ...mtmMeal, program: "MTM" },
      { ...mtmMeal, program: "Emergency" },
    ];
    const groups = marginByDimension(meals, (m) => m.program);
    expect(groups.map((g) => g.key)).toEqual(["MTM", "Emergency"]);
    expect(groups[0].mealCount).toBe(2);
    expect(groups[1].mealCount).toBe(1);
  });
});
