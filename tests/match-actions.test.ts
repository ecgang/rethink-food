import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above all imports — factory bodies must not reference
// outer `const` variables. Use inline vi.fn() and retrieve refs via imports.

// Stub server-only boundary so the import doesn't throw in Node.
vi.mock("server-only", () => ({}));
// Stub Next.js cache invalidation — no filesystem side-effects in tests.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Prisma mock: only `meal.createMany` is called by matchSupply.
vi.mock("@/lib/db", () => ({
  prisma: { meal: { createMany: vi.fn() } },
}));

// Current-role mock — mutated per-test.
import * as currentRole from "@/lib/current-role";
vi.mock("@/lib/current-role", () => ({
  getCurrentRole: vi.fn(),
  getOperatorIdentity: vi.fn(),
}));

// Partners mock — controls what eligibleProducers / getMatchOptions return.
import * as partners from "@/lib/partners";
vi.mock("@/lib/partners", () => ({
  eligibleProducers: vi.fn(),
  getMatchOptions: vi.fn(),
}));

import { matchSupply } from "@/app/actions/match";
import { prisma } from "@/lib/db";

// Typed mock references.
const createMany = prisma.meal.createMany as ReturnType<typeof vi.fn>;
const mockGetCurrentRole = currentRole.getCurrentRole as ReturnType<typeof vi.fn>;
const mockEligibleProducers = partners.eligibleProducers as ReturnType<typeof vi.fn>;
const mockGetMatchOptions = partners.getMatchOptions as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const MARKET_ID = "market_1";
const KITCHEN_ID = "kitchen_1";
const RESTAURANT_ID = "restaurant_1";
const CONTRACT_ID = "contract_1";
const PROGRAM_ID = "program_1";
const CBO_ID = "cbo_1";
const SLUG = "east-harlem";

const KITCHEN_PRODUCER = {
  id: KITCHEN_ID,
  type: "kitchen" as const,
  name: "Test Kitchen",
  weeklyCapacity: 50,
  committed: 10,
  spare: 40,
};

const RESTAURANT_PRODUCER = {
  id: RESTAURANT_ID,
  type: "restaurant" as const,
  name: "Test Restaurant",
  weeklyCapacity: 30,
  committed: 5,
  spare: 25,
};

const MATCH_OPTIONS = {
  cbos: [{ id: CBO_ID, name: "Test CBO" }],
  contracts: [{ id: CONTRACT_ID, name: "Test Contract", programId: PROGRAM_ID }],
};

function makeFormData(
  overrides: Record<string, string | null> = {},
): FormData {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    marketId: MARKET_ID,
    producerType: "kitchen",
    producerId: KITCHEN_ID,
    contractId: CONTRACT_ID,
    cboId: CBO_ID,
    quantity: "5",
    slug: SLUG,
  };
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
    if (v !== null) fd.set(k, v);
  }
  return fd;
}

beforeEach(() => {
  createMany.mockReset();
  mockGetCurrentRole.mockReset();
  mockEligibleProducers.mockReset();
  mockGetMatchOptions.mockReset();

  // Default: EXEC role, happy-path producers/options.
  mockGetCurrentRole.mockResolvedValue("EXEC");
  mockEligibleProducers.mockResolvedValue([KITCHEN_PRODUCER, RESTAURANT_PRODUCER]);
  mockGetMatchOptions.mockResolvedValue(MATCH_OPTIONS);
  createMany.mockResolvedValue({ count: 5 });
});

// ---------------------------------------------------------------------------
// RBAC gate
// ---------------------------------------------------------------------------

describe("RBAC gate", () => {
  it("rejects FINANCE role and does NOT call createMany", async () => {
    mockGetCurrentRole.mockResolvedValue("FINANCE");
    const res = await matchSupply(makeFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/role/i);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("permits EXEC role", async () => {
    mockGetCurrentRole.mockResolvedValue("EXEC");
    const res = await matchSupply(makeFormData());
    expect(res.ok).toBe(true);
    expect(createMany).toHaveBeenCalledOnce();
  });

  it("permits OPS role", async () => {
    mockGetCurrentRole.mockResolvedValue("OPS");
    const res = await matchSupply(makeFormData());
    expect(res.ok).toBe(true);
    expect(createMany).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe("input validation", () => {
  it("rejects quantity < 1", async () => {
    const res = await matchSupply(makeFormData({ quantity: "0" }));
    expect(res.ok).toBe(false);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("rejects missing marketId", async () => {
    const res = await matchSupply(makeFormData({ marketId: null }));
    expect(res.ok).toBe(false);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("rejects missing producerId", async () => {
    const res = await matchSupply(makeFormData({ producerId: null }));
    expect(res.ok).toBe(false);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("rejects invalid producerType", async () => {
    const res = await matchSupply(makeFormData({ producerType: "factory" }));
    expect(res.ok).toBe(false);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("rejects missing contractId", async () => {
    const res = await matchSupply(makeFormData({ contractId: null }));
    expect(res.ok).toBe(false);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("rejects missing cboId", async () => {
    const res = await matchSupply(makeFormData({ cboId: null }));
    expect(res.ok).toBe(false);
    expect(createMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Capacity guard
// ---------------------------------------------------------------------------

describe("capacity guard", () => {
  it("rejects when quantity > spare capacity", async () => {
    // spare is 40 — request 41
    const res = await matchSupply(makeFormData({ quantity: "41" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/capacity/i);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("rejects when producer not in eligibleProducers list", async () => {
    mockEligibleProducers.mockResolvedValue([]); // no eligible producers
    const res = await matchSupply(makeFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not found/i);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("accepts quantity exactly equal to spare capacity", async () => {
    const res = await matchSupply(makeFormData({ quantity: "40" }));
    expect(res.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Contract / CBO validation
// ---------------------------------------------------------------------------

describe("contract and CBO validation", () => {
  it("rejects when contractId not in market options", async () => {
    mockGetMatchOptions.mockResolvedValue({ ...MATCH_OPTIONS, contracts: [] });
    const res = await matchSupply(makeFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/contract/i);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("rejects when cboId not in market options", async () => {
    mockGetMatchOptions.mockResolvedValue({ ...MATCH_OPTIONS, cbos: [] });
    const res = await matchSupply(makeFormData());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/CBO/i);
    expect(createMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Happy path — correct createMany payload shape
// ---------------------------------------------------------------------------

describe("happy path", () => {
  it("calls createMany once with `quantity` rows", async () => {
    const res = await matchSupply(makeFormData({ quantity: "5" }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.created).toBe(5);
    expect(createMany).toHaveBeenCalledOnce();
    const { data } = createMany.mock.calls[0][0] as { data: unknown[] };
    expect(data).toHaveLength(5);
  });

  it("kitchen producerType sets kitchenId, restaurantPartnerId null", async () => {
    await matchSupply(makeFormData({ producerType: "kitchen", producerId: KITCHEN_ID }));
    const { data } = createMany.mock.calls[0][0] as { data: Record<string, unknown>[] };
    for (const row of data) {
      expect(row.producerType).toBe("KITCHEN");
      expect(row.kitchenId).toBe(KITCHEN_ID);
      expect(row.restaurantPartnerId).toBeNull();
    }
  });

  it("restaurant producerType sets restaurantPartnerId, kitchenId null", async () => {
    const res = await matchSupply(
      makeFormData({ producerType: "restaurant", producerId: RESTAURANT_ID }),
    );
    expect(res.ok).toBe(true);
    const { data } = createMany.mock.calls[0][0] as { data: Record<string, unknown>[] };
    for (const row of data) {
      expect(row.producerType).toBe("RESTAURANT");
      expect(row.restaurantPartnerId).toBe(RESTAURANT_ID);
      expect(row.kitchenId).toBeNull();
    }
  });

  it("every row carries programId, contractId, marketId, cboId, status PLANNED", async () => {
    await matchSupply(makeFormData({ quantity: "3" }));
    const { data } = createMany.mock.calls[0][0] as { data: Record<string, unknown>[] };
    expect(data).toHaveLength(3);
    for (const row of data) {
      expect(row.programId).toBe(PROGRAM_ID);
      expect(row.contractId).toBe(CONTRACT_ID);
      expect(row.marketId).toBe(MARKET_ID);
      expect(row.cboId).toBe(CBO_ID);
      expect(row.status).toBe("PLANNED");
      expect(row.plannedAt).toBeInstanceOf(Date);
      expect(row.mealDate).toBeInstanceOf(Date);
    }
  });

  it("returns ok:true with correct created count", async () => {
    const res = await matchSupply(makeFormData({ quantity: "7" }));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.created).toBe(7);
  });
});
