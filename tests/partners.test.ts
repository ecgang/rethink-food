import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted — factory must not close over outer consts.
vi.mock("@/lib/db", () => ({
  prisma: {
    market: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    kitchen: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    restaurantPartner: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    cbo: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    contract: {
      findMany: vi.fn(),
    },
  },
}));

import {
  marketSlug,
  parseMarketSlug,
  getPartnersExplorer,
  eligibleProducers,
  getMatchOptions,
} from "@/lib/partners";
import { prisma } from "@/lib/db";

// Typed handles for the mocked model methods
const mMarket = prisma.market as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
};
const mKitchen = prisma.kitchen as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
};
const mRestaurant = prisma.restaurantPartner as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
};
const mCbo = prisma.cbo as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
};
const mContract = prisma.contract as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  mMarket.findMany.mockReset();
  mMarket.findUnique.mockReset();
  mKitchen.findMany.mockReset();
  mKitchen.findUnique.mockReset();
  mRestaurant.findMany.mockReset();
  mRestaurant.findUnique.mockReset();
  mCbo.findMany.mockReset();
  mCbo.findUnique.mockReset();
  mContract.findMany.mockReset();
});

// ---------------------------------------------------------------------------
// marketSlug + parseMarketSlug
// ---------------------------------------------------------------------------

describe("marketSlug", () => {
  it("lowercases and converts spaces to hyphens", () => {
    expect(marketSlug("Brooklyn", "Bushwick South")).toBe("brooklyn--bushwick-south");
  });

  it("collapses multiple spaces/punctuation to single hyphens", () => {
    expect(marketSlug("New York", "East New York")).toBe("new-york--east-new-york");
  });

  it("strips leading/trailing hyphens from each segment", () => {
    expect(marketSlug("Bronx", "Mott Haven-Port Morris")).toBe("bronx--mott-haven-port-morris");
  });

  it("is idempotent — applying toKebab twice yields the same result", () => {
    const slug = marketSlug("Queens", "Jackson Heights");
    // slug segments contain only [a-z0-9-] already; re-running the transform
    // on the full slug with double-hyphen separator should be stable
    const reSlug = slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    expect(reSlug).toBe(slug);
  });

  it("handles borough with punctuation (apostrophes, etc.)", () => {
    // Apostrophes are not [a-z0-9], so they collapse to hyphens
    expect(marketSlug("Staten Island", "St. George")).toBe("staten-island--st-george");
  });
});

describe("parseMarketSlug", () => {
  it("splits on double-hyphen separator", () => {
    const result = parseMarketSlug("brooklyn--bushwick-south");
    expect(result.borough).toBe("brooklyn");
    expect(result.neighborhood).toBe("bushwick-south");
  });

  it("returns slug as borough when no separator is present", () => {
    const result = parseMarketSlug("noop");
    expect(result.borough).toBe("noop");
    expect(result.neighborhood).toBe("");
  });
});

describe("marketSlug round-trip identity", () => {
  const pairs: [string, string][] = [
    ["Brooklyn", "Bushwick South"],
    ["Queens", "Jackson Heights"],
    ["Manhattan", "East Harlem South"],
    ["Bronx", "Mott Haven-Port Morris"],
    ["Staten Island", "St. George"],
  ];

  it.each(pairs)("slug(%s, %s) matches itself via findMany scan", async (borough, neighborhood) => {
    // Simulate getMarketBySlug scan: mock a market list including the target
    const slug = marketSlug(borough, neighborhood);
    mMarket.findMany.mockResolvedValue([
      { id: "m1", borough, neighborhood, lat: 40.7, lng: -73.9, weeklyDemand: 100 },
    ]);
    // Inline import to avoid cache() caching across tests
    const { getMarketBySlug } = await import("@/lib/partners");
    const result = await getMarketBySlug(slug);
    expect(result).not.toBeNull();
    expect(result?.borough).toBe(borough);
    expect(result?.neighborhood).toBe(neighborhood);
  });
});

// ---------------------------------------------------------------------------
// getPartnersExplorer
// ---------------------------------------------------------------------------

describe("getPartnersExplorer", () => {
  const baseKitchen = {
    id: "k1",
    name: "Test Kitchen",
    weeklyCapacity: 100,
    market: { borough: "Brooklyn", neighborhood: "Bushwick South" },
    _count: { meals: 5 },
  };
  const baseRestaurant = {
    id: "r1",
    name: "Test Restaurant",
    weeklyCapacity: 80,
    certified: true,
    minorityOwned: false,
    market: { borough: "Brooklyn", neighborhood: "Bushwick South" },
    _count: { meals: 12 },
  };
  const baseCbo = {
    id: "c1",
    name: "Test CBO",
    market: { borough: "Brooklyn", neighborhood: "Bushwick South" },
    _count: { meals: 30 },
  };

  function setupAllTypes() {
    mKitchen.findMany.mockResolvedValue([baseKitchen]);
    mRestaurant.findMany.mockResolvedValue([baseRestaurant]);
    mCbo.findMany.mockResolvedValue([baseCbo]);
  }

  it("returns all three types when no filters applied", async () => {
    setupAllTypes();
    const result = await getPartnersExplorer();
    expect(result.rows).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.capped).toBe(false);
    const types = result.rows.map((r) => r.type);
    expect(types).toContain("kitchen");
    expect(types).toContain("restaurant");
    expect(types).toContain("cbo");
  });

  it("returns only kitchens when type=kitchen", async () => {
    mKitchen.findMany.mockResolvedValue([baseKitchen]);
    const result = await getPartnersExplorer({ type: "kitchen" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].type).toBe("kitchen");
  });

  it("returns only restaurants when type=restaurant", async () => {
    mRestaurant.findMany.mockResolvedValue([baseRestaurant]);
    const result = await getPartnersExplorer({ type: "restaurant" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].type).toBe("restaurant");
  });

  it("returns only CBOs when type=cbo", async () => {
    mCbo.findMany.mockResolvedValue([baseCbo]);
    const result = await getPartnersExplorer({ type: "cbo" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].type).toBe("cbo");
  });

  it("passes certified filter to restaurant query", async () => {
    mRestaurant.findMany.mockResolvedValue([baseRestaurant]);
    await getPartnersExplorer({ type: "restaurant", certified: true });
    const callArg = mRestaurant.findMany.mock.calls[0][0];
    expect(callArg.where.certified).toBe(true);
  });

  it("row shape includes all required fields", async () => {
    mKitchen.findMany.mockResolvedValue([baseKitchen]);
    mRestaurant.findMany.mockResolvedValue([]);
    mCbo.findMany.mockResolvedValue([]);
    const result = await getPartnersExplorer({ type: "kitchen" });
    const row = result.rows[0];
    expect(row).toMatchObject({
      id: "k1",
      type: "kitchen",
      name: "Test Kitchen",
      marketLabel: "Bushwick South, Brooklyn",
      marketSlug: "brooklyn--bushwick-south",
      weeklyCapacity: 100,
      certified: null,
      minorityOwned: null,
      mealCount: 5,
    });
  });

  it("restaurant row includes certified and minorityOwned", async () => {
    mKitchen.findMany.mockResolvedValue([]);
    mRestaurant.findMany.mockResolvedValue([baseRestaurant]);
    mCbo.findMany.mockResolvedValue([]);
    const result = await getPartnersExplorer({ type: "restaurant" });
    const row = result.rows[0];
    expect(row.certified).toBe(true);
    expect(row.minorityOwned).toBe(false);
  });

  it("returns empty result when market slug not found", async () => {
    mMarket.findMany.mockResolvedValue([]);
    const result = await getPartnersExplorer({ market: "nonexistent--slug" });
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("sets capped=true when total exceeds PARTNER_LIMIT (200)", async () => {
    // Build 201 kitchen rows
    const many = Array.from({ length: 201 }, (_, i) => ({
      id: `k${i}`,
      name: `Kitchen ${i}`,
      weeklyCapacity: 50,
      market: { borough: "Brooklyn", neighborhood: "Bushwick South" },
      _count: { meals: 0 },
    }));
    mKitchen.findMany.mockResolvedValue(many);
    mRestaurant.findMany.mockResolvedValue([]);
    mCbo.findMany.mockResolvedValue([]);
    const result = await getPartnersExplorer({ type: "kitchen" });
    expect(result.total).toBe(201);
    expect(result.capped).toBe(true);
    expect(result.rows).toHaveLength(200);
  });
});

// ---------------------------------------------------------------------------
// eligibleProducers — spare capacity math
// ---------------------------------------------------------------------------

describe("eligibleProducers", () => {
  it("filters out producers with zero spare capacity", async () => {
    mKitchen.findMany.mockResolvedValue([
      { id: "k1", name: "Full Kitchen", weeklyCapacity: 50, meals: Array(50).fill({ id: "m" }) },
    ]);
    mRestaurant.findMany.mockResolvedValue([]);
    const result = await eligibleProducers("market1");
    expect(result).toHaveLength(0);
  });

  it("includes producers with spare capacity and computes spare correctly", async () => {
    mKitchen.findMany.mockResolvedValue([
      { id: "k1", name: "Partial Kitchen", weeklyCapacity: 50, meals: Array(30).fill({ id: "m" }) },
    ]);
    mRestaurant.findMany.mockResolvedValue([
      { id: "r1", name: "Partial Restaurant", weeklyCapacity: 80, meals: Array(20).fill({ id: "m" }) },
    ]);
    const result = await eligibleProducers("market1");
    expect(result).toHaveLength(2);

    const kitchen = result.find((p) => p.type === "kitchen");
    expect(kitchen).toBeDefined();
    expect(kitchen?.weeklyCapacity).toBe(50);
    expect(kitchen?.committed).toBe(30);
    expect(kitchen?.spare).toBe(20);

    const restaurant = result.find((p) => p.type === "restaurant");
    expect(restaurant).toBeDefined();
    expect(restaurant?.weeklyCapacity).toBe(80);
    expect(restaurant?.committed).toBe(20);
    expect(restaurant?.spare).toBe(60);
  });

  it("returns empty array when no producers in market", async () => {
    mKitchen.findMany.mockResolvedValue([]);
    mRestaurant.findMany.mockResolvedValue([]);
    const result = await eligibleProducers("market1");
    expect(result).toHaveLength(0);
  });

  it("correctly calculates spare = weeklyCapacity - committed (not zero)", async () => {
    mKitchen.findMany.mockResolvedValue([
      { id: "k2", name: "Kitchen With 1 Spare", weeklyCapacity: 10, meals: Array(9).fill({ id: "m" }) },
    ]);
    mRestaurant.findMany.mockResolvedValue([]);
    const result = await eligibleProducers("market1");
    expect(result).toHaveLength(1);
    expect(result[0].spare).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getMarketDetail — demand/unmet/scheduled math
// ---------------------------------------------------------------------------

describe("getMarketDetail demand math", () => {
  const NOW = new Date("2026-06-21T12:00:00Z");
  const yesterday = new Date(NOW.getTime() - 1 * 24 * 3600 * 1000);
  const tomorrow = new Date(NOW.getTime() + 1 * 24 * 3600 * 1000);
  const twoWeeksAgo = new Date(NOW.getTime() - 14 * 24 * 3600 * 1000);

  const borough = "Brooklyn";
  const neighborhood = "Bushwick South";

  function buildMarket(overrides: {
    weeklyDemand: number;
    meals: { id: string; status: string; mealDate: Date; deliveredAt: Date | null; kitchen: { name: string } | null; restaurantPartner: { name: string } | null; cbo: { name: string } }[];
  }) {
    return {
      id: "m1",
      borough,
      neighborhood,
      weeklyDemand: overrides.weeklyDemand,
      kitchens: [{ id: "k1", name: "K1", weeklyCapacity: 40 }],
      restaurants: [{ id: "r1", name: "R1", weeklyCapacity: 30, certified: true, minorityOwned: false }],
      cbos: [{ id: "c1", name: "C1", address: null, contactEmail: null }],
      meals: overrides.meals,
    };
  }

  it("unmet = max(0, weeklyDemand - fulfilledLast7)", async () => {
    // 3 delivered within last 7 days; demand = 10 → unmet = 7
    mMarket.findMany.mockResolvedValue([{ id: "m1", borough, neighborhood }]);
    mMarket.findUnique.mockResolvedValue(
      buildMarket({
        weeklyDemand: 10,
        meals: [
          { id: "a", status: "DELIVERED", mealDate: yesterday, deliveredAt: yesterday, kitchen: { name: "K1" }, restaurantPartner: null, cbo: { name: "C1" } },
          { id: "b", status: "DELIVERED", mealDate: yesterday, deliveredAt: yesterday, kitchen: { name: "K1" }, restaurantPartner: null, cbo: { name: "C1" } },
          { id: "c", status: "VERIFIED", mealDate: yesterday, deliveredAt: yesterday, kitchen: null, restaurantPartner: { name: "R1" }, cbo: { name: "C1" } },
        ],
      }),
    );
    const { getMarketDetail: gmd } = await import("@/lib/partners");
    const result = await gmd(marketSlug(borough, neighborhood), NOW);
    expect(result).not.toBeNull();
    expect(result!.fulfilledLast7).toBe(3);
    expect(result!.unmet).toBe(7);
  });

  it("unmet is clamped to 0 when fulfilledLast7 >= weeklyDemand", async () => {
    mMarket.findMany.mockResolvedValue([{ id: "m1", borough, neighborhood }]);
    mMarket.findUnique.mockResolvedValue(
      buildMarket({
        weeklyDemand: 2,
        meals: [
          { id: "a", status: "DELIVERED", mealDate: yesterday, deliveredAt: yesterday, kitchen: { name: "K1" }, restaurantPartner: null, cbo: { name: "C1" } },
          { id: "b", status: "DELIVERED", mealDate: yesterday, deliveredAt: yesterday, kitchen: { name: "K1" }, restaurantPartner: null, cbo: { name: "C1" } },
          { id: "c", status: "DELIVERED", mealDate: yesterday, deliveredAt: yesterday, kitchen: { name: "K1" }, restaurantPartner: null, cbo: { name: "C1" } },
        ],
      }),
    );
    const { getMarketDetail: gmd } = await import("@/lib/partners");
    const result = await gmd(marketSlug(borough, neighborhood), NOW);
    expect(result!.unmet).toBe(0);
  });

  it("deliveries older than 7 days do not count toward fulfilledLast7", async () => {
    mMarket.findMany.mockResolvedValue([{ id: "m1", borough, neighborhood }]);
    mMarket.findUnique.mockResolvedValue(
      buildMarket({
        weeklyDemand: 5,
        meals: [
          // old delivery — should NOT count
          { id: "old", status: "DELIVERED", mealDate: twoWeeksAgo, deliveredAt: twoWeeksAgo, kitchen: { name: "K1" }, restaurantPartner: null, cbo: { name: "C1" } },
          // recent delivery — should count
          { id: "recent", status: "DELIVERED", mealDate: yesterday, deliveredAt: yesterday, kitchen: { name: "K1" }, restaurantPartner: null, cbo: { name: "C1" } },
        ],
      }),
    );
    const { getMarketDetail: gmd } = await import("@/lib/partners");
    const result = await gmd(marketSlug(borough, neighborhood), NOW);
    expect(result!.fulfilledLast7).toBe(1);
    expect(result!.unmet).toBe(4);
  });

  it("scheduledThisWeek counts only PLANNED meals with upcoming mealDate within 7 days", async () => {
    mMarket.findMany.mockResolvedValue([{ id: "m1", borough, neighborhood }]);
    mMarket.findUnique.mockResolvedValue(
      buildMarket({
        weeklyDemand: 10,
        meals: [
          // PLANNED and upcoming — should count
          { id: "p1", status: "PLANNED", mealDate: tomorrow, deliveredAt: null, kitchen: { name: "K1" }, restaurantPartner: null, cbo: { name: "C1" } },
          // PLANNED but in the past — should NOT count
          { id: "p2", status: "PLANNED", mealDate: yesterday, deliveredAt: null, kitchen: { name: "K1" }, restaurantPartner: null, cbo: { name: "C1" } },
          // PRODUCED and upcoming — should NOT count (wrong status)
          { id: "p3", status: "PRODUCED", mealDate: tomorrow, deliveredAt: null, kitchen: { name: "K1" }, restaurantPartner: null, cbo: { name: "C1" } },
        ],
      }),
    );
    const { getMarketDetail: gmd } = await import("@/lib/partners");
    const result = await gmd(marketSlug(borough, neighborhood), NOW);
    expect(result!.scheduledThisWeek).toBe(1);
  });

  it("weeklyCapacity sums kitchens + restaurants", async () => {
    mMarket.findMany.mockResolvedValue([{ id: "m1", borough, neighborhood }]);
    mMarket.findUnique.mockResolvedValue(buildMarket({ weeklyDemand: 10, meals: [] }));
    const { getMarketDetail: gmd } = await import("@/lib/partners");
    const result = await gmd(marketSlug(borough, neighborhood), NOW);
    // k1=40 + r1=30 = 70
    expect(result!.weeklyCapacity).toBe(70);
  });

  it("returns null when slug does not match any market", async () => {
    mMarket.findMany.mockResolvedValue([]);
    const { getMarketDetail: gmd } = await import("@/lib/partners");
    const result = await gmd("unknown--slug", NOW);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getMatchOptions
// ---------------------------------------------------------------------------

describe("getMatchOptions", () => {
  it("returns cbos and active contracts for the market", async () => {
    mCbo.findMany.mockResolvedValue([{ id: "c1", name: "CBO One" }]);
    mContract.findMany.mockResolvedValue([
      { id: "ct1", name: "Contract A", programId: "p1" },
    ]);
    const result = await getMatchOptions("market1");
    expect(result.cbos).toHaveLength(1);
    expect(result.cbos[0].id).toBe("c1");
    expect(result.contracts).toHaveLength(1);
    expect(result.contracts[0].programId).toBe("p1");
  });
});
