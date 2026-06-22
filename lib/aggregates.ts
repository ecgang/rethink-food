// SQL aggregation layer — the "reliable data foundation".
//
// Instead of loading every meal + cost line item into JS and summing in memory
// (6,913 meals × 4 line items per render), these push the aggregation into
// Postgres and return a handful of rows. The numbers are defined to match
// lib/margin.ts exactly (realized = DELIVERED|VERIFIED, revenue = program
// reimbursement per realized meal, cost = Σ line items), and parity with the
// former in-JS path is verified before shipping.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CostType } from "@/lib/margin";
import {
  detectExceptions,
  type ExceptionItem,
  type MealSnapshot,
  type KitchenSnapshot,
  type ContractSnapshot,
} from "@/lib/exceptions";
import type {
  DashboardData,
  KpiDeltas,
  MarqueeStats,
  MtmReporting,
} from "@/lib/queries";
import {
  REALIZED_STATUSES,
  DAY_MS as DAY,
  FOOD_BUDGET_PER_MEAL_CENTS,
} from "@/lib/definitions";

// SQL fragment derived from REALIZED_STATUSES so it CANNOT drift from the JS predicate.
// Rendered as LITERAL SQL (not bound params) so Postgres compares the MealStatus enum
// column directly — `m.status IN ($1,$2)` fails with "operator does not exist:
// MealStatus = text" (42883). Prisma.raw is safe here: REALIZED_STATUSES is a
// compile-time constant of our own enum values, never user input.
const REALIZED = Prisma.raw(
  `m.status IN (${REALIZED_STATUSES.map((s) => `'${s}'`).join(", ")})`,
);
const n = (v: bigint | number | null): number => (v == null ? 0 : Number(v));

export type DimensionKey = "program" | "kitchen" | "restaurant" | "contract" | "market";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Count of meals in each lifecycle status. */
export async function statusCounts(): Promise<Record<string, number>> {
  const rows = await prisma.meal.groupBy({ by: ["status"], _count: { _all: true } });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}

export interface RealizedTotals {
  mealCount: number;
  revenueCents: number;
  costCents: number;
  marginCents: number;
  marginPct: number;
  costByType: Record<CostType, number>;
}

/**
 * Realized totals (count, revenue, cost, margin, cost-by-type) for an optional
 * extra meal filter (e.g. a deliveredAt window). Revenue = Σ program rate over
 * realized meals; cost = Σ line items on realized meals.
 */
export async function realizedTotals(
  extra: Prisma.MealWhereInput = {},
): Promise<RealizedTotals> {
  const where: Prisma.MealWhereInput = {
    status: { in: ["DELIVERED", "VERIFIED"] },
    ...extra,
  };
  const [byProgram, programs, byType] = await Promise.all([
    prisma.meal.groupBy({ by: ["programId"], where, _count: { _all: true } }),
    prisma.program.findMany({ select: { id: true, reimbursementRateCents: true } }),
    prisma.mealCostLineItem.groupBy({
      by: ["type"],
      where: { meal: where },
      _sum: { amountCents: true },
    }),
  ]);

  const rate = new Map(programs.map((p) => [p.id, p.reimbursementRateCents]));
  let mealCount = 0;
  let revenueCents = 0;
  for (const g of byProgram) {
    const count = g._count._all;
    mealCount += count;
    revenueCents += count * (rate.get(g.programId) ?? 0);
  }

  const costByType: Record<CostType, number> = { FOOD: 0, LABOR: 0, TRANSPORT: 0, OVERHEAD: 0 };
  for (const g of byType) costByType[g.type as CostType] = g._sum.amountCents ?? 0;
  const costCents = costByType.FOOD + costByType.LABOR + costByType.TRANSPORT + costByType.OVERHEAD;

  return {
    mealCount,
    revenueCents,
    costCents,
    marginCents: revenueCents - costCents,
    marginPct: revenueCents === 0 ? 0 : (revenueCents - costCents) / revenueCents,
    costByType,
  };
}

export interface DimGroup {
  key: string;
  mealCount: number;
  revenueCents: number;
  costCents: number;
  marginCents: number;
  marginPct: number;
}

/** key expression + extra join for a dimension (program is always joined). */
function dimSql(dim: DimensionKey): { key: Prisma.Sql; join: Prisma.Sql } {
  switch (dim) {
    case "program":
      return { key: Prisma.sql`p.name`, join: Prisma.empty };
    case "kitchen":
      return {
        key: Prisma.sql`k.name`,
        join: Prisma.sql`JOIN "Kitchen" k ON k.id = m."kitchenId"`,
      };
    case "restaurant":
      return {
        key: Prisma.sql`r.name`,
        join: Prisma.sql`JOIN "RestaurantPartner" r ON r.id = m."restaurantPartnerId"`,
      };
    case "contract":
      return {
        key: Prisma.sql`ct.name`,
        join: Prisma.sql`JOIN "Contract" ct ON ct.id = m."contractId"`,
      };
    case "market":
      return {
        key: Prisma.sql`mk.neighborhood || ', ' || mk.borough`,
        join: Prisma.sql`JOIN "Market" mk ON mk.id = m."marketId"`,
      };
  }
}

/**
 * Contribution margin grouped by a dimension, realized meals only, ordered by
 * meal count desc. One query: a per-meal cost subquery is LEFT JOINed so the
 * row count isn't inflated by line items. Inner dimension joins drop meals with
 * a null key (e.g. restaurant-produced meals are excluded from the kitchen cut),
 * matching the former in-JS behavior.
 */
export async function marginByDimensionSql(dim: DimensionKey): Promise<DimGroup[]> {
  const { key, join } = dimSql(dim);
  const rows = await prisma.$queryRaw<
    Array<{ key: string; meals: bigint; revenue: bigint; cost: bigint }>
  >(Prisma.sql`
    SELECT ${key} AS key,
           COUNT(*)::bigint AS meals,
           SUM(p."reimbursementRateCents")::bigint AS revenue,
           COALESCE(SUM(cost.total), 0)::bigint AS cost
    FROM "Meal" m
    JOIN "Program" p ON p.id = m."programId"
    ${join}
    LEFT JOIN (
      SELECT "mealId", SUM("amountCents") AS total
      FROM "MealCostLineItem" GROUP BY "mealId"
    ) cost ON cost."mealId" = m.id
    WHERE ${REALIZED}
    GROUP BY ${key}
    ORDER BY meals DESC
  `);
  return rows.map((r) => {
    const revenueCents = n(r.revenue);
    const costCents = n(r.cost);
    return {
      key: r.key,
      mealCount: n(r.meals),
      revenueCents,
      costCents,
      marginCents: revenueCents - costCents,
      marginPct: revenueCents === 0 ? 0 : (revenueCents - costCents) / revenueCents,
    };
  });
}

// ---------------------------------------------------------------------------
// Consumer implementations (same shapes as the former in-JS versions)
// ---------------------------------------------------------------------------

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  program: "Program",
  kitchen: "Kitchen",
  restaurant: "Restaurant partner",
  contract: "Contract / funder",
  market: "Market",
};

export async function getDashboardDataAgg(dim: DimensionKey = "program"): Promise<DashboardData> {
  const [totals, counts, groups] = await Promise.all([
    realizedTotals(),
    statusCounts(),
    marginByDimensionSql(dim),
  ]);
  const verified = counts.VERIFIED ?? 0;
  const delivered = verified + (counts.DELIVERED ?? 0);
  const produced = delivered + (counts.PRODUCED ?? 0);
  const planned = produced + (counts.PLANNED ?? 0);
  return {
    totals: {
      mealCount: totals.mealCount,
      revenueCents: totals.revenueCents,
      costCents: totals.costCents,
      marginCents: totals.marginCents,
      marginPct: totals.marginPct,
    },
    funnel: { planned, produced, delivered, verified },
    costByType: totals.costByType,
    dimensionLabel: DIMENSION_LABELS[dim],
    marginByDimension: groups.map((g) => ({
      key: g.key,
      mealCount: g.mealCount,
      revenueCents: g.revenueCents,
      costCents: g.costCents,
      marginCents: g.marginCents,
      marginPct: g.marginPct,
    })),
  };
}

export async function getKpiDeltasAgg(now: Date = new Date()): Promise<KpiDeltas> {
  const curStart = now.getTime() - 7 * DAY;
  const priorStart = now.getTime() - 14 * DAY;
  const [cur, prior] = await Promise.all([
    realizedTotals({ deliveredAt: { gte: new Date(curStart), lt: new Date(now.getTime()) } }),
    realizedTotals({ deliveredAt: { gte: new Date(priorStart), lt: new Date(curStart) } }),
  ]);
  const pct = (c: number, p: number) => (p === 0 ? 0 : (c - p) / p);
  const curPerMeal = cur.mealCount ? cur.marginCents / cur.mealCount : 0;
  const priorPerMeal = prior.mealCount ? prior.marginCents / prior.mealCount : 0;
  return {
    mealsPct: pct(cur.mealCount, prior.mealCount),
    marginPct: pct(cur.marginCents, prior.marginCents),
    marginPerMealPct: pct(curPerMeal, priorPerMeal),
  };
}

export async function getMarqueeStatsAgg(now: Date = new Date()): Promise<MarqueeStats> {
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const monthAgo = new Date(now.getTime() - 30 * DAY);
  const [week, month, pendingIntake] = await Promise.all([
    realizedTotals({ deliveredAt: { gte: weekAgo } }),
    realizedTotals({ deliveredAt: { gte: monthAgo } }),
    prisma.intakeRequest.count({ where: { status: "PENDING" } }),
  ]);
  return {
    deliveredThisWeek: week.mealCount,
    contributionMonthCents: month.marginCents,
    pendingIntake,
  };
}

interface ScnAggRow { scn: string; revenue: bigint; cost: bigint; delivered7: bigint }

async function mtmByScn(weekAgo: Date) {
  const rows = await prisma.$queryRaw<ScnAggRow[]>(Prisma.sql`
    SELECT ct."scnPartner" AS scn,
           SUM(p."reimbursementRateCents")::bigint AS revenue,
           COALESCE(SUM(cost.total), 0)::bigint AS cost,
           SUM(CASE WHEN m."deliveredAt" >= ${weekAgo} THEN 1 ELSE 0 END)::bigint AS delivered7
    FROM "Meal" m
    JOIN "Program" p ON p.id = m."programId"
    JOIN "Contract" ct ON ct.id = m."contractId"
    LEFT JOIN (
      SELECT "mealId", SUM("amountCents") AS total FROM "MealCostLineItem" GROUP BY "mealId"
    ) cost ON cost."mealId" = m.id
    WHERE ${REALIZED} AND p.type = 'MTM' AND ct."scnPartner" IS NOT NULL
    GROUP BY ct."scnPartner"
  `);
  return rows;
}

export async function getMtmReportingAgg(now: Date = new Date()): Promise<MtmReporting> {
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const [byStatus, activePrescribed, membersByScn, scnAgg, deliveredLast7] = await Promise.all([
    prisma.member.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.member.aggregate({ _sum: { prescribedMealsPerWeek: true }, where: { status: "ACTIVE" } }),
    prisma.member.groupBy({ by: ["scnPartner"], where: { status: "ACTIVE" }, _count: { _all: true } }),
    mtmByScn(weekAgo),
    prisma.meal.count({
      where: { status: { in: ["DELIVERED", "VERIFIED"] }, deliveredAt: { gte: weekAgo }, program: { type: "MTM" } },
    }),
  ]);

  const active = byStatus.find((s) => s.status === "ACTIVE")?._count._all ?? 0;
  const withdrawn = byStatus.find((s) => s.status === "WITHDRAWN")?._count._all ?? 0;
  const totalMembers = active + withdrawn;
  const prescribedPerWeek = activePrescribed._sum.prescribedMealsPerWeek ?? 0;

  const scns = ["PHS", "SOMOS", "SIPPS"];
  const byScn = scns.map((scn) => {
    const a = scnAgg.find((r) => r.scn === scn);
    const revenueCents = n(a?.revenue ?? 0);
    const costCents = n(a?.cost ?? 0);
    const members = membersByScn.find((m) => m.scnPartner === scn)?._count._all ?? 0;
    return {
      scn,
      members,
      deliveredLast7: n(a?.delivered7 ?? 0),
      marginCents: revenueCents - costCents,
      marginPct: revenueCents === 0 ? 0 : (revenueCents - costCents) / revenueCents,
    };
  });

  return {
    activeMembers: active,
    withdrawnMembers: withdrawn,
    retentionPct: totalMembers ? active / totalMembers : 0,
    prescribedPerWeek,
    deliveredLast7,
    fulfillmentPct: prescribedPerWeek ? deliveredLast7 / prescribedPerWeek : 0,
    byScn,
  };
}

interface KitchenAggRow { id: string; meals: bigint; produced7: bigint; food: bigint }

async function kitchenAggregates(weekAgo: Date): Promise<Map<string, { meals: number; produced7: number; food: number }>> {
  const rows = await prisma.$queryRaw<KitchenAggRow[]>(Prisma.sql`
    SELECT m."kitchenId" AS id,
           COUNT(*)::bigint AS meals,
           SUM(CASE WHEN m."producedAt" >= ${weekAgo} THEN 1 ELSE 0 END)::bigint AS produced7,
           COALESCE(SUM(food.total), 0)::bigint AS food
    FROM "Meal" m
    LEFT JOIN (
      SELECT "mealId", SUM("amountCents") AS total FROM "MealCostLineItem"
      WHERE type = 'FOOD' GROUP BY "mealId"
    ) food ON food."mealId" = m.id
    WHERE m."kitchenId" IS NOT NULL
    GROUP BY m."kitchenId"
  `);
  return new Map(rows.map((r) => [r.id, { meals: n(r.meals), produced7: n(r.produced7), food: n(r.food) }]));
}

export async function getActOnTodayAgg(now: Date = new Date()): Promise<ExceptionItem[]> {
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const [meals, kitchens, kAgg, contractsRaw] = await Promise.all([
    prisma.meal.findMany({
      where: { status: { in: ["PRODUCED", "DELIVERED"] } },
      select: {
        id: true, status: true, mealDate: true, producedAt: true, deliveredAt: true,
        program: { select: { name: true } }, cbo: { select: { name: true } },
      },
    }),
    prisma.kitchen.findMany({ select: { id: true, name: true, weeklyCapacity: true } }),
    kitchenAggregates(weekAgo),
    prisma.contract.findMany({
      select: { id: true, name: true, billingDeadline: true, lastInvoicedAt: true, funder: { select: { name: true } } },
    }),
  ]);

  const mealSnapshots: MealSnapshot[] = meals.map((m) => ({
    id: m.id, status: m.status, mealDate: m.mealDate,
    producedAt: m.producedAt, deliveredAt: m.deliveredAt,
    programName: m.program.name, cboName: m.cbo.name,
  }));

  const kitchenSnapshots: KitchenSnapshot[] = kitchens.map((k) => {
    const a = kAgg.get(k.id);
    return {
      id: k.id, name: k.name, weeklyCapacity: k.weeklyCapacity,
      producedThisWeek: a?.produced7 ?? 0,
      foodCostPerMealCents: a && a.meals > 0 ? Math.round(a.food / a.meals) : 0,
      foodBudgetPerMealCents: FOOD_BUDGET_PER_MEAL_CENTS,
    };
  });

  const contractSnapshots: ContractSnapshot[] = contractsRaw.map((c) => ({
    id: c.id, name: c.name, funderName: c.funder.name,
    billingDeadline: c.billingDeadline, lastInvoicedAt: c.lastInvoicedAt,
  }));

  return detectExceptions({ meals: mealSnapshots, kitchens: kitchenSnapshots, contracts: contractSnapshots, now });
}
