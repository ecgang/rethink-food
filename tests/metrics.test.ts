/**
 * Contract test for the metrics layer: the numbers must reconcile.
 *
 * The core invariant of a trustworthy operating system — and the thing the
 * "Reliable Data Foundation" pillar is about — is that no two views disagree.
 * Every slice (by program, kitchen, restaurant, contract, market) is derived
 * from the SAME pure functions, so for any dataset the sum of a dimension's
 * groups must exactly equal the global total. This test fails loudly if a
 * future change ever lets a slice drift from the headline number.
 */
import { describe, it, expect } from "vitest";
import {
  rollupMargin,
  marginByDimension,
  type MealEconInput,
} from "@/lib/margin";
import { DEFINITIONS, isRealized, REALIZED_STATUSES } from "@/lib/definitions";

interface TaggedMeal extends MealEconInput {
  program: string;
  kitchen: string;
  market: string;
}

// a believable mixed dataset spanning multiple programs/kitchens/markets
function dataset(): TaggedMeal[] {
  const meals: TaggedMeal[] = [];
  const programs = [
    { name: "MTM", reimbursement: 950, food: 390 },
    { name: "Restaurant Response", reimbursement: 650, food: 340 },
    { name: "Emergency Relief", reimbursement: 600, food: 310 },
  ];
  const kitchens = ["SCK GV", "SCK Brooklyn"];
  const markets = ["Mott Haven", "Corona", "Brownsville"];
  let i = 0;
  for (const p of programs) {
    for (let n = 0; n < 37; n++) {
      i++;
      meals.push({
        program: p.name,
        kitchen: kitchens[i % kitchens.length],
        market: markets[i % markets.length],
        reimbursementCents: p.reimbursement,
        costLineItems: [
          { type: "FOOD", amountCents: p.food + (i % 5) * 7 },
          { type: "LABOR", amountCents: 210 },
          { type: "TRANSPORT", amountCents: 90 },
          { type: "OVERHEAD", amountCents: 45 },
        ],
      });
    }
  }
  return meals;
}

describe("metrics contract — slices reconcile to the total", () => {
  const meals = dataset();
  const total = rollupMargin(meals);

  for (const dim of ["program", "kitchen", "market"] as const) {
    it(`Σ(${dim} slices) === total for count, revenue, cost, margin`, () => {
      const groups = marginByDimension(meals, (m) => m[dim]);
      const sum = groups.reduce(
        (acc, g) => ({
          mealCount: acc.mealCount + g.mealCount,
          revenueCents: acc.revenueCents + g.revenueCents,
          costCents: acc.costCents + g.costCents,
          marginCents: acc.marginCents + g.marginCents,
        }),
        { mealCount: 0, revenueCents: 0, costCents: 0, marginCents: 0 },
      );
      expect(sum.mealCount).toBe(total.mealCount);
      expect(sum.revenueCents).toBe(total.revenueCents);
      expect(sum.costCents).toBe(total.costCents);
      expect(sum.marginCents).toBe(total.marginCents);
    });
  }

  it("margin == revenue - cost at the aggregate level", () => {
    expect(total.marginCents).toBe(total.revenueCents - total.costCents);
  });

  it("blended margin% is consistent with components", () => {
    expect(total.marginPct).toBeCloseTo(total.marginCents / total.revenueCents, 9);
  });
});

describe("definitions registry", () => {
  it("covers the core terms surfaced in the UI", () => {
    const terms = DEFINITIONS.map((d) => d.term.toLowerCase());
    for (const required of ["meal", "cost", "revenue", "contribution margin"]) {
      expect(terms.some((t) => t.includes(required))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Realized-status parity — pins prose dictionary to runtime behaviour.
// The SQL fragment in lib/aggregates.ts is derived from REALIZED_STATUSES via
// Prisma.join(), so all three (JS predicate, SQL fragment, prose definition)
// share the same source and CANNOT drift independently.
// ---------------------------------------------------------------------------
describe("realized-status parity", () => {
  it("REALIZED_STATUSES contains exactly DELIVERED and VERIFIED", () => {
    expect([...REALIZED_STATUSES].sort()).toEqual(["DELIVERED", "VERIFIED"]);
  });

  it("isRealized returns true for DELIVERED", () => {
    expect(isRealized("DELIVERED")).toBe(true);
  });

  it("isRealized returns true for VERIFIED", () => {
    expect(isRealized("VERIFIED")).toBe(true);
  });

  it("isRealized returns false for PLANNED", () => {
    expect(isRealized("PLANNED")).toBe(false);
  });

  it("isRealized returns false for PRODUCED", () => {
    expect(isRealized("PRODUCED")).toBe(false);
  });

  it("isRealized rejects unknown statuses", () => {
    expect(isRealized("")).toBe(false);
    expect(isRealized("CANCELLED")).toBe(false);
  });
});
