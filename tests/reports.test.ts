import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — hoisted before imports
// ---------------------------------------------------------------------------

vi.mock("@/lib/db", () => ({
  prisma: {
    reportSnapshot: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/funders", () => ({
  getFundersRoster: vi.fn(),
}));

vi.mock("@/lib/aggregates", () => ({
  realizedTotals: vi.fn(),
}));

import { buildWeeklyReportPayload, persistWeeklyReport, getReportSnapshots } from "@/lib/reports";
import { prisma } from "@/lib/db";
import { getFundersRoster } from "@/lib/funders";
import { realizedTotals } from "@/lib/aggregates";

// ---------------------------------------------------------------------------
// Typed mock handles
// ---------------------------------------------------------------------------

const mockCreate = prisma.reportSnapshot.create as ReturnType<typeof vi.fn>;
const mockFindMany = prisma.reportSnapshot.findMany as ReturnType<typeof vi.fn>;
const mockGetFundersRoster = getFundersRoster as ReturnType<typeof vi.fn>;
const mockRealizedTotals = realizedTotals as ReturnType<typeof vi.fn>;

const STUB_FUNDERS = [
  {
    id: "f-1",
    name: "NYC DOHMH",
    kind: "GOVERNMENT",
    mealsServed: 120,
    dollarsDeliveredCents: 144000,
    contractCount: 2,
  },
];

const STUB_TOTALS = {
  mealCount: 120,
  revenueCents: 144000,
  costCents: 100000,
  marginCents: 44000,
  marginPct: 0.305,
  costByType: { FOOD: 100000 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetFundersRoster.mockResolvedValue(STUB_FUNDERS);
  mockRealizedTotals.mockResolvedValue(STUB_TOTALS);
});

// ---------------------------------------------------------------------------
// buildWeeklyReportPayload
// ---------------------------------------------------------------------------

describe("buildWeeklyReportPayload", () => {
  it("returns the correct shape", async () => {
    const now = new Date("2025-01-13T09:00:00Z");
    const result = await buildWeeklyReportPayload(now);

    expect(result).toMatchObject({
      totals: {
        mealsServed: 120,
        dollarsDeliveredCents: 144000,
        contributionMarginCents: 44000,
      },
      funders: STUB_FUNDERS,
    });
  });

  it("sets periodEnd to now and periodStart 7 days earlier", async () => {
    const now = new Date("2025-01-13T09:00:00Z");
    const result = await buildWeeklyReportPayload(now);

    const start = new Date(result.periodStart);
    const end = new Date(result.periodEnd);

    expect(end.toISOString()).toBe("2025-01-13T09:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("passes the correct deliveredAt window to realizedTotals", async () => {
    const now = new Date("2025-01-13T09:00:00Z");
    await buildWeeklyReportPayload(now);

    expect(mockRealizedTotals).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveredAt: expect.objectContaining({
          gte: expect.any(Date),
          lt: now,
        }),
      }),
    );
  });

  it("returns all funders from getFundersRoster", async () => {
    const now = new Date("2025-01-13T09:00:00Z");
    const result = await buildWeeklyReportPayload(now);
    expect(result.funders).toHaveLength(1);
    expect(result.funders[0].id).toBe("f-1");
  });
});

// ---------------------------------------------------------------------------
// persistWeeklyReport
// ---------------------------------------------------------------------------

describe("persistWeeklyReport", () => {
  const STUB_ROW = {
    id: "snap-abc",
    kind: "FUNDER_IMPACT",
    title: "Funder impact — week of Jan 6, 2025",
    periodStart: new Date("2025-01-06T09:00:00Z"),
    periodEnd: new Date("2025-01-13T09:00:00Z"),
    payload: {},
    generatedBy: "weekly-cron",
    createdAt: new Date("2025-01-13T09:00:00Z"),
  };

  beforeEach(() => {
    mockCreate.mockResolvedValue(STUB_ROW);
  });

  it("calls reportSnapshot.create with kind FUNDER_IMPACT", async () => {
    const now = new Date("2025-01-13T09:00:00Z");
    await persistWeeklyReport("weekly-cron", now);

    expect(mockCreate).toHaveBeenCalledOnce();
    const { data } = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.kind).toBe("FUNDER_IMPACT");
  });

  it("stores the payload with the expected totals shape", async () => {
    const now = new Date("2025-01-13T09:00:00Z");
    await persistWeeklyReport("weekly-cron", now);

    const { data } = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    const payload = data.payload as { totals: { mealsServed: number } };
    expect(payload.totals.mealsServed).toBe(120);
  });

  it("records the generatedBy identity", async () => {
    const now = new Date("2025-01-13T09:00:00Z");
    await persistWeeklyReport("Marcus Lee · Finance", now);

    const { data } = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.generatedBy).toBe("Marcus Lee · Finance");
  });

  it("returns the created row", async () => {
    const now = new Date("2025-01-13T09:00:00Z");
    const result = await persistWeeklyReport("weekly-cron", now);
    expect(result.id).toBe("snap-abc");
  });
});

// ---------------------------------------------------------------------------
// getReportSnapshots
// ---------------------------------------------------------------------------

describe("getReportSnapshots", () => {
  it("queries with orderBy createdAt desc and default limit 20", async () => {
    mockFindMany.mockResolvedValue([]);
    await getReportSnapshots();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    );
  });

  it("respects a custom limit", async () => {
    mockFindMany.mockResolvedValue([]);
    await getReportSnapshots(5);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });
});
