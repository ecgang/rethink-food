import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted — factory must not reference outer const variables.
vi.mock("@/lib/db", () => ({
  prisma: {
    funder: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { getFundersRoster, getFunderImpact } from "@/lib/funders";
import { prisma } from "@/lib/db";

const funder = prisma.funder as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  funder.findMany.mockReset();
  funder.findUnique.mockReset();
});

// ---------------------------------------------------------------------------
// Helpers: mini fixture builders
// ---------------------------------------------------------------------------

function makeMeal(
  status: "PLANNED" | "PRODUCED" | "DELIVERED" | "VERIFIED",
  opts: {
    memberId?: string | null;
    marketId?: string;
    cboId?: string;
    restaurantPartnerId?: string | null;
    certified?: boolean;
    rate?: number;
    costCents?: number;
  } = {},
) {
  const {
    memberId = null,
    marketId = "mkt-1",
    cboId = "cbo-1",
    restaurantPartnerId = null,
    certified = false,
    rate = 1200,
    costCents = 800,
  } = opts;
  return {
    status,
    memberId,
    marketId,
    cboId,
    restaurantPartnerId,
    restaurantPartner: restaurantPartnerId ? { certified } : null,
    program: { reimbursementRateCents: rate },
    costLineItems: [{ type: "FOOD" as const, amountCents: costCents }],
  };
}

// ---------------------------------------------------------------------------
// getFunderImpact
// ---------------------------------------------------------------------------

describe("getFunderImpact", () => {
  it("returns null when funder not found", async () => {
    funder.findUnique.mockResolvedValue(null);
    const result = await getFunderImpact("non-existent");
    expect(result).toBeNull();
  });

  it("counts only DELIVERED and VERIFIED meals as realized", async () => {
    funder.findUnique.mockResolvedValue({
      id: "f1",
      name: "DYCD",
      kind: "Government",
      contracts: [
        {
          id: "c1",
          name: "Contract A",
          budgetCents: BigInt(100_000_00),
          program: { name: "MTM", reimbursementRateCents: 1200 },
          meals: [
            makeMeal("PLANNED"),
            makeMeal("PRODUCED"),
            makeMeal("DELIVERED"),
            makeMeal("VERIFIED"),
          ],
        },
      ],
    });
    const impact = await getFunderImpact("f1");
    expect(impact).not.toBeNull();
    expect(impact!.mealsServed).toBe(2); // DELIVERED + VERIFIED only
  });

  it("computes dollarsDeliveredCents as realized count × reimbursementRateCents", async () => {
    funder.findUnique.mockResolvedValue({
      id: "f1",
      name: "DYCD",
      kind: "Government",
      contracts: [
        {
          id: "c1",
          name: "Contract A",
          budgetCents: BigInt(500_000_00),
          program: { name: "MTM", reimbursementRateCents: 1500 },
          meals: [
            makeMeal("DELIVERED", { rate: 1500 }),
            makeMeal("VERIFIED", { rate: 1500 }),
            makeMeal("PLANNED", { rate: 1500 }),
          ],
        },
      ],
    });
    const impact = await getFunderImpact("f1");
    // 2 realized × 1500 = 3000
    expect(impact!.dollarsDeliveredCents).toBe(3000);
  });

  it("computes contributionMarginCents = revenue − cost across realized meals", async () => {
    // rate=1200, cost=800 per meal → margin=400 per meal, 2 meals → 800
    funder.findUnique.mockResolvedValue({
      id: "f1",
      name: "DYCD",
      kind: "Government",
      contracts: [
        {
          id: "c1",
          name: "Contract A",
          budgetCents: BigInt(100_000_00),
          program: { name: "MTM", reimbursementRateCents: 1200 },
          meals: [
            makeMeal("DELIVERED", { rate: 1200, costCents: 800 }),
            makeMeal("VERIFIED", { rate: 1200, costCents: 800 }),
          ],
        },
      ],
    });
    const impact = await getFunderImpact("f1");
    expect(impact!.contributionMarginCents).toBe(800);
  });

  it("counts distinct memberIds for peopleServed (non-null only)", async () => {
    funder.findUnique.mockResolvedValue({
      id: "f1",
      name: "Test",
      kind: "Philanthropy",
      contracts: [
        {
          id: "c1",
          name: "Contract A",
          budgetCents: BigInt(10_000_00),
          program: { name: "MTM", reimbursementRateCents: 1200 },
          meals: [
            makeMeal("DELIVERED", { memberId: "mem-1" }),
            makeMeal("DELIVERED", { memberId: "mem-1" }), // duplicate — should count once
            makeMeal("DELIVERED", { memberId: "mem-2" }),
            makeMeal("DELIVERED", { memberId: null }), // null — should not count
            makeMeal("PLANNED", { memberId: "mem-3" }), // not realized — not counted
          ],
        },
      ],
    });
    const impact = await getFunderImpact("f1");
    expect(impact!.peopleServed).toBe(2);
  });

  it("counts distinct marketIds for neighborhoodsReached", async () => {
    funder.findUnique.mockResolvedValue({
      id: "f1",
      name: "Test",
      kind: "Healthcare",
      contracts: [
        {
          id: "c1",
          name: "Contract A",
          budgetCents: BigInt(10_000_00),
          program: { name: "MTM", reimbursementRateCents: 1200 },
          meals: [
            makeMeal("DELIVERED", { marketId: "mkt-1" }),
            makeMeal("DELIVERED", { marketId: "mkt-1" }), // duplicate
            makeMeal("DELIVERED", { marketId: "mkt-2" }),
          ],
        },
      ],
    });
    const impact = await getFunderImpact("f1");
    expect(impact!.neighborhoodsReached).toBe(2);
  });

  it("counts distinct cboIds for cboNetwork", async () => {
    funder.findUnique.mockResolvedValue({
      id: "f1",
      name: "Test",
      kind: "Healthcare",
      contracts: [
        {
          id: "c1",
          name: "Contract A",
          budgetCents: BigInt(10_000_00),
          program: { name: "MTM", reimbursementRateCents: 1200 },
          meals: [
            makeMeal("DELIVERED", { cboId: "cbo-1" }),
            makeMeal("VERIFIED", { cboId: "cbo-1" }), // duplicate
            makeMeal("DELIVERED", { cboId: "cbo-2" }),
            makeMeal("DELIVERED", { cboId: "cbo-3" }),
          ],
        },
      ],
    });
    const impact = await getFunderImpact("f1");
    expect(impact!.cboNetwork).toBe(3);
  });

  it("counts only certified restaurantPartners for certifiedRestaurants", async () => {
    funder.findUnique.mockResolvedValue({
      id: "f1",
      name: "Test",
      kind: "Philanthropy",
      contracts: [
        {
          id: "c1",
          name: "Contract A",
          budgetCents: BigInt(10_000_00),
          program: { name: "MTM", reimbursementRateCents: 1200 },
          meals: [
            makeMeal("DELIVERED", { restaurantPartnerId: "rp-1", certified: true }),
            makeMeal("DELIVERED", { restaurantPartnerId: "rp-1", certified: true }), // same rp, count once
            makeMeal("DELIVERED", { restaurantPartnerId: "rp-2", certified: false }), // not certified
            makeMeal("DELIVERED", { restaurantPartnerId: null }), // kitchen-produced
          ],
        },
      ],
    });
    const impact = await getFunderImpact("f1");
    expect(impact!.certifiedRestaurants).toBe(1);
  });

  it("sums budgetCents across contracts (BigInt → Number)", async () => {
    funder.findUnique.mockResolvedValue({
      id: "f1",
      name: "Test",
      kind: "Government",
      contracts: [
        {
          id: "c1",
          name: "Contract A",
          budgetCents: BigInt(50_000_00),
          program: { name: "MTM", reimbursementRateCents: 1200 },
          meals: [],
        },
        {
          id: "c2",
          name: "Contract B",
          budgetCents: BigInt(30_000_00),
          program: { name: "RR", reimbursementRateCents: 900 },
          meals: [],
        },
      ],
    });
    const impact = await getFunderImpact("f1");
    expect(impact!.budgetCents).toBe(8_000_000);
  });

  it("returns budgetUtilizationPct = 0 when budgetCents is 0 (guard divide-by-zero)", async () => {
    funder.findUnique.mockResolvedValue({
      id: "f1",
      name: "Test",
      kind: "Philanthropy",
      contracts: [
        {
          id: "c1",
          name: "Contract A",
          budgetCents: BigInt(0),
          program: { name: "MTM", reimbursementRateCents: 1200 },
          meals: [makeMeal("DELIVERED")],
        },
      ],
    });
    const impact = await getFunderImpact("f1");
    expect(impact!.budgetUtilizationPct).toBe(0);
  });

  it("computes budgetUtilizationPct correctly when budget > 0", async () => {
    // 2 realized meals × rate 1200 = 2400 dollars; budget = 10000
    // utilization = 2400 / 10000 = 0.24
    funder.findUnique.mockResolvedValue({
      id: "f1",
      name: "Test",
      kind: "Government",
      contracts: [
        {
          id: "c1",
          name: "Contract A",
          budgetCents: BigInt(10000),
          program: { name: "MTM", reimbursementRateCents: 1200 },
          meals: [makeMeal("DELIVERED", { rate: 1200 }), makeMeal("VERIFIED", { rate: 1200 })],
        },
      ],
    });
    const impact = await getFunderImpact("f1");
    expect(impact!.budgetUtilizationPct).toBeCloseTo(0.24);
  });

  it("includes per-contract breakdown in contracts array", async () => {
    funder.findUnique.mockResolvedValue({
      id: "f1",
      name: "DYCD",
      kind: "Government",
      contracts: [
        {
          id: "c1",
          name: "Contract A",
          budgetCents: BigInt(50_000),
          program: { name: "MTM", reimbursementRateCents: 1200 },
          meals: [makeMeal("DELIVERED", { rate: 1200 }), makeMeal("PLANNED", { rate: 1200 })],
        },
      ],
    });
    const impact = await getFunderImpact("f1");
    expect(impact!.contracts).toHaveLength(1);
    const line = impact!.contracts[0];
    expect(line.contractId).toBe("c1");
    expect(line.contractName).toBe("Contract A");
    expect(line.programName).toBe("MTM");
    expect(line.mealsServed).toBe(1); // only DELIVERED
    expect(line.dollarsDeliveredCents).toBe(1200);
    expect(line.budgetCents).toBe(50_000);
  });

  it("aggregates realized meals across multiple contracts", async () => {
    funder.findUnique.mockResolvedValue({
      id: "f1",
      name: "Multi",
      kind: "Healthcare",
      contracts: [
        {
          id: "c1",
          name: "Contract A",
          budgetCents: BigInt(10_000),
          program: { name: "MTM", reimbursementRateCents: 1000 },
          meals: [makeMeal("DELIVERED", { rate: 1000 }), makeMeal("VERIFIED", { rate: 1000 })],
        },
        {
          id: "c2",
          name: "Contract B",
          budgetCents: BigInt(20_000),
          program: { name: "RR", reimbursementRateCents: 800 },
          meals: [makeMeal("DELIVERED", { rate: 800 })],
        },
      ],
    });
    const impact = await getFunderImpact("f1");
    expect(impact!.mealsServed).toBe(3); // 2 + 1
    expect(impact!.dollarsDeliveredCents).toBe(2800); // 1000+1000+800
  });
});

// ---------------------------------------------------------------------------
// getFundersRoster
// ---------------------------------------------------------------------------

describe("getFundersRoster", () => {
  it("returns a row with correct shape for each funder", async () => {
    funder.findMany.mockResolvedValue([
      {
        id: "f1",
        name: "DYCD",
        kind: "Government",
        contracts: [
          {
            id: "c1",
            meals: [
              { program: { reimbursementRateCents: 1200 } },
              { program: { reimbursementRateCents: 1200 } },
            ],
          },
        ],
      },
    ]);
    const rows = await getFundersRoster();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.id).toBe("f1");
    expect(row.name).toBe("DYCD");
    expect(row.kind).toBe("Government");
    expect(row.mealsServed).toBe(2);
    expect(row.dollarsDeliveredCents).toBe(2400);
    expect(row.contractCount).toBe(1);
  });

  it("sorts by mealsServed descending", async () => {
    funder.findMany.mockResolvedValue([
      {
        id: "f1",
        name: "Small",
        kind: "Philanthropy",
        contracts: [
          { id: "c1", meals: [{ program: { reimbursementRateCents: 1000 } }] },
        ],
      },
      {
        id: "f2",
        name: "Large",
        kind: "Government",
        contracts: [
          {
            id: "c2",
            meals: [
              { program: { reimbursementRateCents: 1000 } },
              { program: { reimbursementRateCents: 1000 } },
              { program: { reimbursementRateCents: 1000 } },
            ],
          },
        ],
      },
    ]);
    const rows = await getFundersRoster();
    expect(rows[0].id).toBe("f2"); // 3 meals
    expect(rows[1].id).toBe("f1"); // 1 meal
  });

  it("returns an empty array when there are no funders", async () => {
    funder.findMany.mockResolvedValue([]);
    const rows = await getFundersRoster();
    expect(rows).toEqual([]);
  });

  it("returns contractCount=0 and mealsServed=0 for a funder with no contracts", async () => {
    funder.findMany.mockResolvedValue([
      { id: "f1", name: "Empty", kind: "Philanthropy", contracts: [] },
    ]);
    const rows = await getFundersRoster();
    expect(rows[0].contractCount).toBe(0);
    expect(rows[0].mealsServed).toBe(0);
    expect(rows[0].dollarsDeliveredCents).toBe(0);
  });
});
