import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above all imports — factories must not reference outer consts.

vi.mock("@/lib/db", () => ({
  prisma: {
    meal: { createMany: vi.fn() },
    intakeRequest: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/partners", () => ({
  eligibleProducers: vi.fn(),
  getMatchOptions: vi.fn(),
}));

import * as partners from "@/lib/partners";
import { createScheduledMeals, getApprovedRequests } from "@/lib/scheduling";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Typed mock handles
// ---------------------------------------------------------------------------
const createMany = prisma.meal.createMany as ReturnType<typeof vi.fn>;
const intakeRequestFindMany = (
  prisma.intakeRequest as unknown as { findMany: ReturnType<typeof vi.fn> }
).findMany;
const mockEligibleProducers = partners.eligibleProducers as ReturnType<typeof vi.fn>;
const mockGetMatchOptions = partners.getMatchOptions as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MARKET_ID = "market_1";
const KITCHEN_ID = "kitchen_1";
const RESTAURANT_ID = "restaurant_1";
const CONTRACT_ID = "contract_1";
const PROGRAM_ID = "program_1";
const CBO_ID = "cbo_1";
const INTAKE_ID = "intake_1";

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

const BASE_INPUT = {
  marketId: MARKET_ID,
  producerType: "kitchen" as const,
  producerId: KITCHEN_ID,
  contractId: CONTRACT_ID,
  cboId: CBO_ID,
  quantity: 5,
  mealDate: new Date("2026-07-01"),
};

// ---------------------------------------------------------------------------
// createScheduledMeals
// ---------------------------------------------------------------------------

describe("createScheduledMeals", () => {
  beforeEach(() => {
    createMany.mockReset();
    mockEligibleProducers.mockReset();
    mockGetMatchOptions.mockReset();

    mockEligibleProducers.mockResolvedValue([KITCHEN_PRODUCER, RESTAURANT_PRODUCER]);
    mockGetMatchOptions.mockResolvedValue(MATCH_OPTIONS);
    createMany.mockResolvedValue({ count: 5 });
  });

  // ── Validation errors ─────────────────────────────────────────────────────

  it("rejects when producer not in eligibleProducers list", async () => {
    mockEligibleProducers.mockResolvedValue([]);
    const res = await createScheduledMeals(BASE_INPUT);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not found/i);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("rejects when quantity exceeds spare capacity", async () => {
    // spare is 40 — request 41
    const res = await createScheduledMeals({ ...BASE_INPUT, quantity: 41 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/capacity/i);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("rejects when contractId not in market options", async () => {
    const res = await createScheduledMeals({
      ...BASE_INPUT,
      contractId: "unknown_contract",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/contract/i);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("rejects when cboId not in market options", async () => {
    const res = await createScheduledMeals({
      ...BASE_INPUT,
      cboId: "unknown_cbo",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/cbo/i);
    expect(createMany).not.toHaveBeenCalled();
  });

  // ── Happy path ────────────────────────────────────────────────────────────

  it("calls createMany once with `quantity` rows", async () => {
    const res = await createScheduledMeals(BASE_INPUT);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.created).toBe(5);
    expect(createMany).toHaveBeenCalledOnce();
    const { data } = createMany.mock.calls[0][0] as { data: unknown[] };
    expect(data).toHaveLength(5);
  });

  it("kitchen producerType sets kitchenId, restaurantPartnerId null", async () => {
    await createScheduledMeals({
      ...BASE_INPUT,
      producerType: "kitchen",
      producerId: KITCHEN_ID,
    });
    const { data } = createMany.mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
    for (const row of data) {
      expect(row.producerType).toBe("KITCHEN");
      expect(row.kitchenId).toBe(KITCHEN_ID);
      expect(row.restaurantPartnerId).toBeNull();
    }
  });

  it("restaurant producerType sets restaurantPartnerId, kitchenId null", async () => {
    const res = await createScheduledMeals({
      ...BASE_INPUT,
      producerType: "restaurant",
      producerId: RESTAURANT_ID,
    });
    expect(res.ok).toBe(true);
    const { data } = createMany.mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
    for (const row of data) {
      expect(row.producerType).toBe("RESTAURANT");
      expect(row.restaurantPartnerId).toBe(RESTAURANT_ID);
      expect(row.kitchenId).toBeNull();
    }
  });

  it("every row carries programId, contractId, marketId, cboId, status PLANNED", async () => {
    await createScheduledMeals({ ...BASE_INPUT, quantity: 3 });
    const { data } = createMany.mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
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

  it("sets intakeRequestId on rows when provided", async () => {
    await createScheduledMeals({ ...BASE_INPUT, intakeRequestId: INTAKE_ID });
    const { data } = createMany.mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
    for (const row of data) {
      expect(row.intakeRequestId).toBe(INTAKE_ID);
    }
  });

  it("sets intakeRequestId to null when omitted", async () => {
    await createScheduledMeals(BASE_INPUT); // no intakeRequestId
    const { data } = createMany.mock.calls[0][0] as {
      data: Record<string, unknown>[];
    };
    for (const row of data) {
      expect(row.intakeRequestId).toBeNull();
    }
  });

  it("accepts quantity exactly equal to spare capacity", async () => {
    // spare is 40
    const res = await createScheduledMeals({ ...BASE_INPUT, quantity: 40 });
    expect(res.ok).toBe(true);
  });

  it("returns ok:true with correct created count", async () => {
    createMany.mockResolvedValue({ count: 7 });
    const res = await createScheduledMeals({ ...BASE_INPUT, quantity: 7 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.created).toBe(7);
  });

  it("writes via provided tx instead of global prisma when tx is supplied", async () => {
    // Arrange: a mock transaction client with its own createMany spy.
    const txCreateMany = vi.fn().mockResolvedValue({ count: 5 });
    const mockTx = { meal: { createMany: txCreateMany } } as unknown as Parameters<
      typeof createScheduledMeals
    >[1];

    const res = await createScheduledMeals(BASE_INPUT, mockTx);

    expect(res.ok).toBe(true);
    // The write went through the tx, not the global prisma mock.
    expect(txCreateMany).toHaveBeenCalledOnce();
    expect(createMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getApprovedRequests
// ---------------------------------------------------------------------------

describe("getApprovedRequests", () => {
  beforeEach(() => {
    intakeRequestFindMany.mockReset();
    mockEligibleProducers.mockReset();
    mockGetMatchOptions.mockReset();

    mockEligibleProducers.mockResolvedValue([KITCHEN_PRODUCER, RESTAURANT_PRODUCER]);
    mockGetMatchOptions.mockResolvedValue(MATCH_OPTIONS);
  });

  const makeRow = (
    overrides: Partial<{
      id: string;
      status: string;
      fulfilledAt: Date | null;
      cboId: string | null;
      extractedFields: unknown;
    }> = {},
  ) => ({
    id: overrides.id ?? "req_1",
    rawInput: "Please send 30 meals on 2026-08-01",
    extractedFields: overrides.extractedFields ?? {
      cbo: "Test CBO",
      quantity: 30,
      deliveryDate: "2026-08-01",
      recurrence: null,
      dietaryConstraints: [],
      location: null,
      notes: null,
    },
    createdAt: new Date("2026-06-01"),
    approvedAt: new Date("2026-06-10"),
    approvedBy: "ops_user",
    cboId: overrides.cboId ?? CBO_ID,
    cbo: {
      name: "Test CBO",
      market: { id: MARKET_ID },
    },
  });

  it("returns approved requests with quantity from extractedFields", async () => {
    intakeRequestFindMany.mockResolvedValue([makeRow()]);
    const results = await getApprovedRequests();
    expect(results).toHaveLength(1);
    expect(results[0].quantity).toBe(30);
  });

  it("returns approved requests with deliveryDate from extractedFields", async () => {
    intakeRequestFindMany.mockResolvedValue([makeRow()]);
    const results = await getApprovedRequests();
    expect(results[0].deliveryDate).toBe("2026-08-01");
  });

  it("handles null quantity in extractedFields gracefully", async () => {
    intakeRequestFindMany.mockResolvedValue([
      makeRow({ extractedFields: { quantity: null, deliveryDate: "2026-08-01" } }),
    ]);
    const results = await getApprovedRequests();
    expect(results[0].quantity).toBeNull();
  });

  it("handles missing deliveryDate in extractedFields gracefully", async () => {
    intakeRequestFindMany.mockResolvedValue([
      makeRow({ extractedFields: { quantity: 10, deliveryDate: null } }),
    ]);
    const results = await getApprovedRequests();
    expect(results[0].deliveryDate).toBeNull();
  });

  it("suggestion picks the first eligible producer (highest spare) for the market", async () => {
    // KITCHEN_PRODUCER has spare:40, RESTAURANT_PRODUCER has spare:25
    // eligibleProducers returns them in the order the mock provides (highest spare first)
    mockEligibleProducers.mockResolvedValue([KITCHEN_PRODUCER, RESTAURANT_PRODUCER]);
    intakeRequestFindMany.mockResolvedValue([makeRow()]);
    const results = await getApprovedRequests();
    expect(results[0].suggestion.producer?.id).toBe(KITCHEN_ID);
  });

  it("suggestion picks the first active contract for the market", async () => {
    intakeRequestFindMany.mockResolvedValue([makeRow()]);
    const results = await getApprovedRequests();
    expect(results[0].suggestion.contract?.id).toBe(CONTRACT_ID);
  });

  it("suggestion.producer is null when no eligible producers exist", async () => {
    mockEligibleProducers.mockResolvedValue([]);
    intakeRequestFindMany.mockResolvedValue([makeRow()]);
    const results = await getApprovedRequests();
    expect(results[0].suggestion.producer).toBeNull();
  });

  it("surfaces cboId and marketId on each result", async () => {
    intakeRequestFindMany.mockResolvedValue([makeRow()]);
    const results = await getApprovedRequests();
    expect(results[0].cboId).toBe(CBO_ID);
    expect(results[0].marketId).toBe(MARKET_ID);
  });

  it("queries prisma with APPROVED status and fulfilledAt:null filter", async () => {
    intakeRequestFindMany.mockResolvedValue([]);
    await getApprovedRequests();
    const whereArg = intakeRequestFindMany.mock.calls[0][0].where as Record<
      string,
      unknown
    >;
    expect(whereArg.status).toBe("APPROVED");
    // fulfilledAt: null means "not yet fulfilled" — only unfulfilled rows returned
    expect(whereArg.fulfilledAt).toBeNull();
  });
});
