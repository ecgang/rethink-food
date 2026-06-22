import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted, so the factory must not reference outer `const` variables.
// Instead we expose the fns via a shared object after the mock is registered.
vi.mock("@/lib/db", () => ({
  prisma: {
    meal: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { getHeroStats, getFieldQueue } from "@/lib/queries";
// Pull the mocked fns out of the already-mocked module so we can drive them.
import { prisma } from "@/lib/db";
const meal = prisma.meal as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
};

const NOW = new Date("2026-06-21T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

beforeEach(() => {
  meal.findMany.mockReset();
  meal.count.mockReset();
});

// ---------------------------------------------------------------------------
// getHeroStats
// ---------------------------------------------------------------------------

describe("getHeroStats", () => {
  it("counts all returned rows as mealsTracked regardless of status", async () => {
    meal.findMany.mockResolvedValue([
      { status: "VERIFIED" },
      { status: "VERIFIED" },
      { status: "DELIVERED" },
      { status: "PRODUCED" },
      { status: "PLANNED" },
    ]);
    meal.count.mockResolvedValue(7);
    const s = await getHeroStats(NOW);
    expect(s.mealsTracked).toBe(5);
  });

  it("passes the deliveredThisWeek value from count directly", async () => {
    meal.findMany.mockResolvedValue([{ status: "VERIFIED" }, { status: "DELIVERED" }]);
    meal.count.mockResolvedValue(7);
    const s = await getHeroStats(NOW);
    expect(s.deliveredThisWeek).toBe(7);
  });

  it("derives verified rate as verified / (verified + delivered)", async () => {
    // 2 VERIFIED, 1 DELIVERED → 2/3
    meal.findMany.mockResolvedValue([
      { status: "VERIFIED" },
      { status: "VERIFIED" },
      { status: "DELIVERED" },
      { status: "PRODUCED" },
      { status: "PLANNED" },
    ]);
    meal.count.mockResolvedValue(0);
    const s = await getHeroStats(NOW);
    expect(s.verifiedRate).toBeCloseTo(2 / 3);
  });

  it("returns verifiedRate of 0 when no meals have been delivered or verified", async () => {
    meal.findMany.mockResolvedValue([{ status: "PRODUCED" }, { status: "PLANNED" }]);
    meal.count.mockResolvedValue(0);
    const s = await getHeroStats(NOW);
    expect(s.verifiedRate).toBe(0);
  });

  it("returns verifiedRate of 1 when every closed meal is verified", async () => {
    meal.findMany.mockResolvedValue([{ status: "VERIFIED" }, { status: "VERIFIED" }]);
    meal.count.mockResolvedValue(2);
    const s = await getHeroStats(NOW);
    expect(s.verifiedRate).toBe(1);
  });

  it("returns mealsTracked 0 and deliveredThisWeek 0 for an empty DB", async () => {
    meal.findMany.mockResolvedValue([]);
    meal.count.mockResolvedValue(0);
    const s = await getHeroStats(NOW);
    expect(s.mealsTracked).toBe(0);
    expect(s.deliveredThisWeek).toBe(0);
    expect(s.verifiedRate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getFieldQueue
// ---------------------------------------------------------------------------

describe("getFieldQueue", () => {
  it("maps raw rows to FieldItems with correct marketLabel", async () => {
    meal.findMany.mockResolvedValue([
      {
        id: "m1",
        status: "PRODUCED",
        producedAt: hoursAgo(2),
        deliveredAt: null,
        deliveryPhotoUrl: null,
        program: { name: "MTM" },
        cbo: { name: "POTS" },
        market: { borough: "Bronx", neighborhood: "Mott Haven" },
      },
    ]);
    const q = await getFieldQueue(NOW);
    expect(q).toHaveLength(1);
    expect(q[0].id).toBe("m1");
    expect(q[0].marketLabel).toBe("Mott Haven, Bronx");
  });

  it("places overdue meals before fresh meals (overdue-first ordering)", async () => {
    meal.findMany.mockResolvedValue([
      {
        id: "fresh",
        status: "PRODUCED",
        producedAt: hoursAgo(1),
        deliveredAt: null,
        deliveryPhotoUrl: null,
        program: { name: "MTM" },
        cbo: { name: "POTS" },
        market: { borough: "Bronx", neighborhood: "Mott Haven" },
      },
      {
        id: "late",
        status: "PRODUCED",
        producedAt: hoursAgo(40),
        deliveredAt: null,
        deliveryPhotoUrl: null,
        program: { name: "MTM" },
        cbo: { name: "POTS" },
        market: { borough: "Bronx", neighborhood: "Mott Haven" },
      },
    ]);
    const q = await getFieldQueue(NOW);
    expect(q.map((i) => i.id)).toEqual(["late", "fresh"]);
  });

  it("returns an empty array when there are no actionable meals", async () => {
    meal.findMany.mockResolvedValue([]);
    const q = await getFieldQueue(NOW);
    expect(q).toEqual([]);
  });

  it("preserves deliveryPhotoUrl on a DELIVERED row", async () => {
    meal.findMany.mockResolvedValue([
      {
        id: "m2",
        status: "DELIVERED",
        producedAt: hoursAgo(5),
        deliveredAt: hoursAgo(1),
        deliveryPhotoUrl: "https://cdn.example.com/photo.jpg",
        program: { name: "MTM" },
        cbo: { name: "POTS" },
        market: { borough: "Queens", neighborhood: "Flushing" },
      },
    ]);
    const q = await getFieldQueue(NOW);
    expect(q[0].deliveryPhotoUrl).toBe("https://cdn.example.com/photo.jpg");
  });
});
