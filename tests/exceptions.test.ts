import { describe, it, expect } from "vitest";
import {
  detectExceptions,
  type ExceptionInput,
  type MealSnapshot,
  type KitchenSnapshot,
  type ContractSnapshot,
} from "@/lib/exceptions";

const NOW = new Date("2026-06-21T12:00:00Z");

function baseInput(over: Partial<ExceptionInput> = {}): ExceptionInput {
  return {
    meals: [],
    kitchens: [],
    contracts: [],
    now: NOW,
    ...over,
  };
}

const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000);
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * 86400 * 1000);

const cleanMeal: MealSnapshot = {
  id: "m-ok",
  status: "VERIFIED",
  mealDate: hoursAgo(72),
  producedAt: hoursAgo(70),
  deliveredAt: hoursAgo(68),
  programName: "MTM",
  cboName: "Part of the Solution",
};

describe("detectExceptions — quiet on healthy data", () => {
  it("returns no exceptions when everything is on track", () => {
    const out = detectExceptions(
      baseInput({
        meals: [cleanMeal],
        kitchens: [
          {
            id: "k1",
            name: "SCK Greenwich Village",
            weeklyCapacity: 1000,
            producedThisWeek: 900,
            foodCostPerMealCents: 380,
            foodBudgetPerMealCents: 400,
          },
        ],
        contracts: [
          {
            id: "c1",
            name: "MTM 1115",
            funderName: "NY State Medicaid",
            billingDeadline: daysFromNow(20),
            lastInvoicedAt: null,
          },
        ],
      }),
    );
    expect(out).toEqual([]);
  });
});

describe("detectExceptions — meal lifecycle", () => {
  it("flags a meal produced but not delivered past the threshold", () => {
    const out = detectExceptions(
      baseInput({
        meals: [
          {
            id: "m1",
            status: "PRODUCED",
            mealDate: hoursAgo(30),
            producedAt: hoursAgo(30),
            deliveredAt: null,
            programName: "MTM",
            cboName: "Bronx Works",
          },
        ],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].reasonCode).toBe("PRODUCED_NOT_DELIVERED");
    expect(out[0].severity).toBe("HIGH"); // 30h is past 24h but below the 48h CRITICAL line
  });

  it("escalates to CRITICAL when very stale", () => {
    const out = detectExceptions(
      baseInput({
        meals: [
          {
            id: "m1",
            status: "PRODUCED",
            mealDate: hoursAgo(60),
            producedAt: hoursAgo(60),
            deliveredAt: null,
            programName: "MTM",
            cboName: "Bronx Works",
          },
        ],
      }),
    );
    expect(out[0].severity).toBe("CRITICAL");
  });

  it("flags delivered-but-unverified meals", () => {
    const out = detectExceptions(
      baseInput({
        meals: [
          {
            id: "m2",
            status: "DELIVERED",
            mealDate: hoursAgo(60),
            producedAt: hoursAgo(60),
            deliveredAt: hoursAgo(50),
            programName: "MTM",
            cboName: "Masbia",
          },
        ],
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].reasonCode).toBe("DELIVERED_NOT_VERIFIED");
    expect(out[0].severity).toBe("MEDIUM");
  });
});

describe("detectExceptions — kitchen", () => {
  it("flags a kitchen over food budget", () => {
    const k: KitchenSnapshot = {
      id: "k2",
      name: "SCK Brooklyn",
      weeklyCapacity: 1000,
      producedThisWeek: 950,
      foodCostPerMealCents: 520,
      foodBudgetPerMealCents: 400, // 30% over
    };
    const out = detectExceptions(baseInput({ kitchens: [k] }));
    const codes = out.map((o) => o.reasonCode);
    expect(codes).toContain("KITCHEN_OVER_FOOD_BUDGET");
  });

  it("flags an underutilized kitchen", () => {
    const k: KitchenSnapshot = {
      id: "k3",
      name: "SCK Queens",
      weeklyCapacity: 1000,
      producedThisWeek: 400, // 40% utilization
      foodCostPerMealCents: 380,
      foodBudgetPerMealCents: 400,
    };
    const out = detectExceptions(baseInput({ kitchens: [k] }));
    expect(out.map((o) => o.reasonCode)).toContain("KITCHEN_UNDER_CAPACITY");
  });
});

describe("detectExceptions — contract billing", () => {
  it("flags billing due soon and overdue, sorted by severity", () => {
    const contracts: ContractSnapshot[] = [
      {
        id: "c-due",
        name: "MTM PHS",
        funderName: "Public Health Solutions",
        billingDeadline: daysFromNow(2),
        lastInvoicedAt: null,
      },
      {
        id: "c-late",
        name: "MTM SOMOS",
        funderName: "SOMOS",
        billingDeadline: daysFromNow(-1),
        lastInvoicedAt: null,
      },
    ];
    const out = detectExceptions(baseInput({ contracts }));
    expect(out).toHaveLength(2);
    // CRITICAL (overdue) sorts before HIGH (due soon)
    expect(out[0].reasonCode).toBe("CONTRACT_BILLING_OVERDUE");
    expect(out[0].severity).toBe("CRITICAL");
    expect(out[1].reasonCode).toBe("CONTRACT_BILLING_DUE");
  });

  it("suppresses the billing exception once invoiced this cycle", () => {
    const contracts: ContractSnapshot[] = [
      {
        id: "c-billed",
        name: "MTM PHS",
        funderName: "Public Health Solutions",
        billingDeadline: daysFromNow(-1), // overdue…
        lastInvoicedAt: hoursAgo(2), // …but just invoiced → loop closed
      },
    ];
    const out = detectExceptions(baseInput({ contracts }));
    expect(out).toEqual([]);
  });
});
