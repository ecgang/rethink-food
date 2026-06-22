import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above all imports — factory bodies must not reference
// outer `const` variables. Use inline vi.fn() and retrieve refs via imports.

// Stub server-only boundary so the import doesn't throw in Node.
vi.mock("server-only", () => ({}));
// Stub Next.js cache invalidation — no filesystem side-effects in tests.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// Prisma mock: fulfillIntake calls intakeRequest.findUnique, intakeRequest.update.
vi.mock("@/lib/db", () => ({
  prisma: {
    intakeRequest: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Current-role mock — mutated per-test.
import * as currentRole from "@/lib/current-role";
vi.mock("@/lib/current-role", () => ({
  getCurrentRole: vi.fn(),
  getOperatorIdentity: vi.fn(),
}));

// Scheduling mock — controls createScheduledMeals.
import * as scheduling from "@/lib/scheduling";
vi.mock("@/lib/scheduling", () => ({
  createScheduledMeals: vi.fn(),
}));

import { fulfillIntake } from "@/app/actions/intake-fulfill";
import { prisma } from "@/lib/db";

// Typed mock references.
const mockFindUnique = prisma.intakeRequest.findUnique as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.intakeRequest.update as ReturnType<typeof vi.fn>;
const mockGetCurrentRole = currentRole.getCurrentRole as ReturnType<typeof vi.fn>;
const mockGetOperatorIdentity = currentRole.getOperatorIdentity as ReturnType<typeof vi.fn>;
const mockCreateScheduledMeals = scheduling.createScheduledMeals as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const REQUEST_ID = "req_1";
const MARKET_ID = "market_1";
const CBO_ID = "cbo_1";
const PRODUCER_ID = "kitchen_1";
const CONTRACT_ID = "contract_1";
const OPERATOR_IDENTITY = "Eric Gang · Executive (COO)";

const APPROVED_REQUEST = {
  id: REQUEST_ID,
  status: "APPROVED",
  cboId: CBO_ID,
  extractedFields: { quantity: 10, deliveryDate: "2026-07-01" },
  cbo: { id: CBO_ID, marketId: MARKET_ID },
};

function makeFormData(overrides: Record<string, string | null> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    requestId: REQUEST_ID,
    producerType: "kitchen",
    producerId: PRODUCER_ID,
    contractId: CONTRACT_ID,
  };
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
    if (v !== null) fd.append(k, v);
  }
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy-path role.
  mockGetCurrentRole.mockResolvedValue("EXEC");
  mockGetOperatorIdentity.mockResolvedValue(OPERATOR_IDENTITY);
  mockFindUnique.mockResolvedValue(APPROVED_REQUEST);
  mockUpdate.mockResolvedValue({});
  mockCreateScheduledMeals.mockResolvedValue({ ok: true, created: 10 });
});

// ---------------------------------------------------------------------------
// RBAC gate
// ---------------------------------------------------------------------------

describe("RBAC gate", () => {
  it("FINANCE role → rejected, no createScheduledMeals call, no request update", async () => {
    mockGetCurrentRole.mockResolvedValue("FINANCE");

    const res = await fulfillIntake(makeFormData({ quantity: "5" }));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/role/i);
    expect(mockCreateScheduledMeals).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("OPS role is permitted", async () => {
    mockGetCurrentRole.mockResolvedValue("OPS");
    mockCreateScheduledMeals.mockResolvedValue({ ok: true, created: 5 });

    const res = await fulfillIntake(makeFormData({ quantity: "5" }));

    expect(res.ok).toBe(true);
  });

  it("EXEC role is permitted", async () => {
    const res = await fulfillIntake(makeFormData({ quantity: "5" }));
    expect(res.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

describe("request validation", () => {
  it("non-APPROVED status PENDING → rejected, no meals created", async () => {
    mockFindUnique.mockResolvedValue({ ...APPROVED_REQUEST, status: "PENDING" });

    const res = await fulfillIntake(makeFormData({ quantity: "5" }));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/PENDING/);
    expect(mockCreateScheduledMeals).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("already FULFILLED request → rejected, no meals created", async () => {
    mockFindUnique.mockResolvedValue({ ...APPROVED_REQUEST, status: "FULFILLED" });

    const res = await fulfillIntake(makeFormData({ quantity: "5" }));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/FULFILLED/);
    expect(mockCreateScheduledMeals).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("request not found → rejected", async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await fulfillIntake(makeFormData({ quantity: "5" }));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not found/i);
    expect(mockCreateScheduledMeals).not.toHaveBeenCalled();
  });

  it("null cbo on request → rejected, no meals created", async () => {
    mockFindUnique.mockResolvedValue({ ...APPROVED_REQUEST, cboId: null, cbo: null });

    const res = await fulfillIntake(makeFormData({ quantity: "5" }));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/CBO/i);
    expect(mockCreateScheduledMeals).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("happy path", () => {
  it("calls createScheduledMeals with intakeRequestId and derived marketId/cboId", async () => {
    const res = await fulfillIntake(makeFormData({ quantity: "5" }));

    expect(res.ok).toBe(true);
    expect(mockCreateScheduledMeals).toHaveBeenCalledOnce();
    const callArg = mockCreateScheduledMeals.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.intakeRequestId).toBe(REQUEST_ID);
    expect(callArg.marketId).toBe(MARKET_ID);
    expect(callArg.cboId).toBe(CBO_ID);
    expect(callArg.producerId).toBe(PRODUCER_ID);
    expect(callArg.contractId).toBe(CONTRACT_ID);
  });

  it("updates request to FULFILLED with fulfilledAt and fulfilledBy", async () => {
    await fulfillIntake(makeFormData({ quantity: "5" }));

    expect(mockUpdate).toHaveBeenCalledOnce();
    const updateArg = mockUpdate.mock.calls[0][0] as {
      where: { id: string };
      data: { status: string; fulfilledAt: Date; fulfilledBy: string };
    };
    expect(updateArg.where.id).toBe(REQUEST_ID);
    expect(updateArg.data.status).toBe("FULFILLED");
    expect(updateArg.data.fulfilledAt).toBeInstanceOf(Date);
    expect(updateArg.data.fulfilledBy).toBe(OPERATOR_IDENTITY);
  });

  it("returns ok:true with created count from createScheduledMeals", async () => {
    mockCreateScheduledMeals.mockResolvedValue({ ok: true, created: 7 });

    const res = await fulfillIntake(makeFormData({ quantity: "7" }));

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.created).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Quantity defaulting
// ---------------------------------------------------------------------------

describe("quantity defaulting from extractedFields", () => {
  it("uses extractedFields.quantity when form omits quantity", async () => {
    // extractedFields has quantity: 10 (from APPROVED_REQUEST fixture).
    const fd = makeFormData(); // no quantity key

    const res = await fulfillIntake(fd);

    expect(res.ok).toBe(true);
    const callArg = mockCreateScheduledMeals.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.quantity).toBe(10);
  });

  it("prefers form quantity over extractedFields.quantity", async () => {
    const res = await fulfillIntake(makeFormData({ quantity: "3" }));

    expect(res.ok).toBe(true);
    const callArg = mockCreateScheduledMeals.mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.quantity).toBe(3);
  });

  it("returns error when form omits quantity and extractedFields has none", async () => {
    mockFindUnique.mockResolvedValue({
      ...APPROVED_REQUEST,
      extractedFields: { deliveryDate: "2026-07-01" }, // no quantity
    });

    const res = await fulfillIntake(makeFormData()); // no quantity key

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/quantity/i);
    expect(mockCreateScheduledMeals).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createScheduledMeals failure propagation
// ---------------------------------------------------------------------------

describe("scheduling failure", () => {
  it("when createScheduledMeals returns ok:false → status NOT changed", async () => {
    mockCreateScheduledMeals.mockResolvedValue({
      ok: false,
      error: "Quantity exceeds spare capacity.",
    });

    const res = await fulfillIntake(makeFormData({ quantity: "999" }));

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/capacity/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
