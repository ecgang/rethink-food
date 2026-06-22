import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted, so the factory must not reference outer `const` variables.
vi.mock("@/lib/db", () => ({
  prisma: {
    intakeRequest: {
      findMany: vi.fn(),
    },
    meal: {
      findMany: vi.fn(),
    },
    invoice: {
      findMany: vi.fn(),
    },
  },
}));

import { getAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";

const intakeRequest = prisma.intakeRequest as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};
const meal = prisma.meal as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};
const invoice = prisma.invoice as unknown as {
  findMany: ReturnType<typeof vi.fn>;
};

const T = (offset: number) => new Date(1_000_000_000_000 + offset);

beforeEach(() => {
  intakeRequest.findMany.mockReset();
  meal.findMany.mockReset();
  invoice.findMany.mockReset();
});

// ---------------------------------------------------------------------------
// Helpers: empty defaults so tests only need to set what they care about
// ---------------------------------------------------------------------------
function defaultMocks(overrides: {
  intake?: object[];
  deliveredMeals?: object[];
  verifiedMeals?: object[];
  invoices?: object[];
}) {
  intakeRequest.findMany.mockResolvedValue(overrides.intake ?? []);
  // meal.findMany is called twice: first for delivered, then for verified
  meal.findMany
    .mockResolvedValueOnce(overrides.deliveredMeals ?? [])
    .mockResolvedValueOnce(overrides.verifiedMeals ?? []);
  invoice.findMany.mockResolvedValue(overrides.invoices ?? []);
}

// ---------------------------------------------------------------------------
// IntakeRequest events
// ---------------------------------------------------------------------------
describe("IntakeRequest events", () => {
  it("emits an approved event when approvedAt + approvedBy are set", async () => {
    defaultMocks({
      intake: [
        {
          id: "ir-1",
          status: "APPROVED",
          approvedAt: T(100),
          approvedBy: "Ana · Admin",
          fulfilledAt: null,
          fulfilledBy: null,
          cbo: { name: "POTS" },
        },
      ],
    });

    const events = await getAuditLog();
    const e = events.find((x) => x.id === "intake-approved-ir-1");
    expect(e).toBeDefined();
    expect(e?.action).toBe("Approved intake request");
    expect(e?.actor).toBe("Ana · Admin");
    expect(e?.entityType).toBe("intake");
    expect(e?.entityLabel).toBe("POTS");
    expect(e?.href).toBe("/intake");
  });

  it("emits a rejected event when status is REJECTED", async () => {
    defaultMocks({
      intake: [
        {
          id: "ir-2",
          status: "REJECTED",
          approvedAt: T(200),
          approvedBy: "Ben · Ops",
          fulfilledAt: null,
          fulfilledBy: null,
          cbo: null,
        },
      ],
    });

    const events = await getAuditLog();
    const e = events.find((x) => x.id === "intake-approved-ir-2");
    expect(e?.action).toBe("Rejected intake request");
    expect(e?.entityLabel).toBe("intake request");
  });

  it("emits BOTH approved and fulfilled events for a fulfilled request", async () => {
    defaultMocks({
      intake: [
        {
          id: "ir-3",
          status: "FULFILLED",
          approvedAt: T(300),
          approvedBy: "Ana · Admin",
          fulfilledAt: T(400),
          fulfilledBy: "Ben · Ops",
          cbo: { name: "City Harvest" },
        },
      ],
    });

    const events = await getAuditLog();
    const approved = events.find((x) => x.id === "intake-approved-ir-3");
    const fulfilled = events.find((x) => x.id === "intake-fulfilled-ir-3");

    expect(approved).toBeDefined();
    expect(approved?.action).toBe("Approved intake request");
    expect(fulfilled).toBeDefined();
    expect(fulfilled?.action).toBe("Fulfilled intake — scheduled meals");
    expect(fulfilled?.actor).toBe("Ben · Ops");
  });

  it("drops intake rows where approvedBy is null", async () => {
    defaultMocks({
      intake: [
        {
          id: "ir-4",
          status: "PENDING",
          approvedAt: null,
          approvedBy: null,
          fulfilledAt: null,
          fulfilledBy: null,
          cbo: null,
        },
      ],
    });

    const events = await getAuditLog();
    expect(events.filter((e) => e.id.startsWith("intake-"))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Meal events
// ---------------------------------------------------------------------------
describe("Meal events", () => {
  it("emits a delivered event for a meal with deliveredAt + deliveredBy", async () => {
    defaultMocks({
      deliveredMeals: [
        {
          id: "meal-abc123",
          mealDate: new Date("2026-06-01"),
          deliveredAt: T(500),
          deliveredBy: "Carlos · Field",
        },
      ],
    });

    const events = await getAuditLog();
    const e = events.find((x) => x.id === "meal-delivered-meal-abc123");
    expect(e).toBeDefined();
    expect(e?.action).toBe("Marked delivered");
    expect(e?.actor).toBe("Carlos · Field");
    expect(e?.entityType).toBe("field");
    expect(e?.href).toBe("/meals/meal-abc123");
  });

  it("emits a verified event for a meal with verifiedAt + verifiedBy", async () => {
    defaultMocks({
      verifiedMeals: [
        {
          id: "meal-def456",
          mealDate: new Date("2026-06-02"),
          verifiedAt: T(600),
          verifiedBy: "Dana · Supervisor",
        },
      ],
    });

    const events = await getAuditLog();
    const e = events.find((x) => x.id === "meal-verified-meal-def456");
    expect(e).toBeDefined();
    expect(e?.action).toBe("Verified delivery");
    expect(e?.actor).toBe("Dana · Supervisor");
    expect(e?.entityType).toBe("field");
  });

  it("drops meal rows where deliveredBy is null (null actor guard)", async () => {
    defaultMocks({
      deliveredMeals: [
        {
          id: "meal-ghost",
          mealDate: new Date("2026-06-03"),
          deliveredAt: T(700),
          deliveredBy: null,
        },
      ],
    });

    const events = await getAuditLog();
    expect(events.find((e) => e.id === "meal-delivered-meal-ghost")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Invoice events
// ---------------------------------------------------------------------------
describe("Invoice events", () => {
  it("emits a generated-invoice event", async () => {
    defaultMocks({
      invoices: [
        {
          id: "inv-xyz789",
          createdAt: T(800),
          createdBy: "Eve · Finance",
          contractId: "contract-1",
        },
      ],
    });

    const events = await getAuditLog();
    const e = events.find((x) => x.id === "invoice-inv-xyz789");
    expect(e).toBeDefined();
    expect(e?.action).toBe("Generated invoice");
    expect(e?.actor).toBe("Eve · Finance");
    expect(e?.entityType).toBe("invoice");
    expect(e?.href).toBe("/contracts/contract-1");
  });
});

// ---------------------------------------------------------------------------
// Sorting + slicing
// ---------------------------------------------------------------------------
describe("sorting and slicing", () => {
  it("returns events sorted newest-first", async () => {
    defaultMocks({
      intake: [
        {
          id: "ir-sort",
          status: "APPROVED",
          approvedAt: T(1000),
          approvedBy: "Ana · Admin",
          fulfilledAt: null,
          fulfilledBy: null,
          cbo: null,
        },
      ],
      invoices: [
        {
          id: "inv-sort",
          createdAt: T(2000),
          createdBy: "Eve · Finance",
          contractId: "c1",
        },
      ],
    });

    const events = await getAuditLog();
    const times = events.map((e) => e.at.getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
    }
  });

  it("slices the result to the requested limit", async () => {
    const manyInvoices = Array.from({ length: 10 }, (_, i) => ({
      id: `inv-${i}`,
      createdAt: T(i * 100),
      createdBy: "Eve · Finance",
      contractId: "c1",
    }));

    defaultMocks({ invoices: manyInvoices });

    const events = await getAuditLog(3);
    expect(events).toHaveLength(3);
  });

  it("returns an empty array when there are no events", async () => {
    defaultMocks({});
    const events = await getAuditLog();
    expect(events).toEqual([]);
  });
});
