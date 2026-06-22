import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { rollupMargin, mealEcon, type CostType } from "@/lib/margin";
import {
  isRealized,
  WEEK_MS,
  FOOD_BUDGET_PER_MEAL_CENTS,
} from "@/lib/definitions";
import {
  buildFieldQueue,
  verificationRate,
  type FieldItem,
  type FieldMeal,
} from "@/lib/field";
import {
  getDashboardDataAgg,
  getActOnTodayAgg,
  getKpiDeltasAgg,
  getMarqueeStatsAgg,
  getMtmReportingAgg,
} from "@/lib/aggregates";
import { marketSlug } from "@/lib/partners";


export type DimensionKey =
  | "program"
  | "kitchen"
  | "restaurant"
  | "contract"
  | "market";

export interface DashboardData {
  totals: {
    mealCount: number;
    revenueCents: number;
    costCents: number;
    marginCents: number;
    marginPct: number;
  };
  funnel: { planned: number; produced: number; delivered: number; verified: number };
  costByType: Record<CostType, number>;
  dimensionLabel: string;
  marginByDimension: Array<{
    key: string;
    mealCount: number;
    revenueCents: number;
    costCents: number;
    marginCents: number;
    marginPct: number;
  }>;
}

// SQL-aggregated in lib/aggregates.ts; cache() dedups across the streamed
// dashboard sections that each request it within one render.
export const getDashboardData = cache(getDashboardDataAgg);

/** The "act on today" feed — SQL-aggregated, runs the exception engine live. */
export const getActOnToday = getActOnTodayAgg;

export interface KpiDeltas {
  /** signed fraction change, current 7d vs prior 7d */
  mealsPct: number;
  marginPct: number;
  marginPerMealPct: number;
}

/** Recent momentum: current 7-day vs prior 7-day window on realized meals. */
export const getKpiDeltas = getKpiDeltasAgg;

export interface MarqueeStats {
  deliveredThisWeek: number;
  contributionMonthCents: number;
  pendingIntake: number;
}

/** Small live figures for the editorial marquee bar. */
export const getMarqueeStats = getMarqueeStatsAgg;

/**
 * The frontline operator queue for the /field PWA: every meal awaiting a
 * delivery or verification, ordered by urgency. Advancing one of these (via the
 * field server actions) clears the matching "act on today" exception, because
 * getActOnToday recomputes from live meal state.
 */
export async function getFieldQueue(now: Date = new Date()): Promise<FieldItem[]> {
  const meals = await prisma.meal.findMany({
    where: { status: { in: ["PRODUCED", "DELIVERED"] } },
    select: {
      id: true,
      status: true,
      producedAt: true,
      deliveredAt: true,
      deliveryPhotoUrl: true,
      program: { select: { name: true } },
      cbo: { select: { name: true } },
      market: { select: { borough: true, neighborhood: true } },
    },
  });

  const fieldMeals: FieldMeal[] = meals.map((m) => ({
    id: m.id,
    status: m.status,
    programName: m.program.name,
    cboName: m.cbo.name,
    marketLabel: `${m.market.neighborhood}, ${m.market.borough}`,
    producedAt: m.producedAt,
    deliveredAt: m.deliveredAt,
    deliveryPhotoUrl: m.deliveryPhotoUrl,
  }));

  return buildFieldQueue(fieldMeals, now);
}

export interface HeroStats {
  /** every meal the operating system is tracking */
  mealsTracked: number;
  /** meals delivered in the trailing 7 days */
  deliveredThisWeek: number;
  /** share of delivered meals that have been verified (0..1) */
  verifiedRate: number;
}

/**
 * Live operational figures for the hero band — replaces static marketing
 * numbers with real signal computed from the meal lifecycle. The verification
 * rate is the closure of the produced→delivered→verified loop, so it rises in
 * real time as field operators verify meals.
 */
export async function getHeroStats(now: Date = new Date()): Promise<HeroStats> {
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const [statuses, deliveredThisWeek] = await Promise.all([
    prisma.meal.findMany({ select: { status: true } }),
    prisma.meal.count({ where: { deliveredAt: { gte: weekAgo } } }),
  ]);
  return {
    mealsTracked: statuses.length,
    deliveredThisWeek,
    verifiedRate: verificationRate(statuses.map((s) => s.status)),
  };
}

export interface MtmReporting {
  activeMembers: number;
  withdrawnMembers: number;
  retentionPct: number;
  prescribedPerWeek: number;
  deliveredLast7: number;
  fulfillmentPct: number;
  byScn: Array<{
    scn: string;
    members: number;
    deliveredLast7: number;
    marginCents: number;
    marginPct: number;
  }>;
}

/** MTM-specific reporting: retention, delivered-vs-prescribed, SCN attribution. */
export const getMtmReporting = getMtmReportingAgg;

export interface DemandMapPartnerSummary {
  kitchens: number;
  restaurants: number;
  cbos: number;
  names: string[];
}

export interface DemandMapPoint {
  borough: string;
  neighborhood: string;
  lat: number;
  lng: number;
  weeklyDemand: number;
  weeklyCapacity: number;
  fulfilledLast7: number;
  unmet: number;
  slug: string;
  partners: DemandMapPartnerSummary;
}

/** Demand vs. capacity by neighborhood for the map tab. */
export async function getDemandMap(now: Date = new Date()): Promise<DemandMapPoint[]> {
  const markets = await prisma.market.findMany({
    select: {
      borough: true,
      neighborhood: true,
      lat: true,
      lng: true,
      weeklyDemand: true,
      kitchens: { select: { weeklyCapacity: true, name: true } },
      restaurants: { select: { weeklyCapacity: true, name: true } },
      cbos: { select: { name: true } },
      meals: {
        where: { deliveredAt: { gte: new Date(now.getTime() - WEEK_MS) } },
        select: { id: true },
      },
    },
  });

  return markets.map((m) => {
    const weeklyCapacity =
      m.kitchens.reduce((s, k) => s + k.weeklyCapacity, 0) +
      m.restaurants.reduce((s, r) => s + r.weeklyCapacity, 0);
    const fulfilledLast7 = m.meals.length;
    const NAMES_LIMIT = 6;
    const allNames = [
      ...m.kitchens.slice(0, NAMES_LIMIT).map((k) => `${k.name} (kitchen)`),
      ...m.restaurants.slice(0, NAMES_LIMIT).map((r) => `${r.name} (restaurant)`),
      ...m.cbos.slice(0, NAMES_LIMIT).map((c) => `${c.name} (CBO)`),
    ].slice(0, NAMES_LIMIT);
    return {
      borough: m.borough,
      neighborhood: m.neighborhood,
      lat: m.lat,
      lng: m.lng,
      weeklyDemand: m.weeklyDemand,
      weeklyCapacity,
      fulfilledLast7,
      unmet: Math.max(0, m.weeklyDemand - fulfilledLast7),
      slug: marketSlug(m.borough, m.neighborhood),
      partners: {
        kitchens: m.kitchens.length,
        restaurants: m.restaurants.length,
        cbos: m.cbos.length,
        names: allNames,
      },
    };
  });
}

// ----------------------------------------------------------------------------
// Drill-down detail + explorer queries (Cluster A — "make it operable")
// ----------------------------------------------------------------------------

const cents = (b: bigint | number): number => (typeof b === "bigint" ? Number(b) : b);

export interface MealDetail {
  id: string;
  status: "PLANNED" | "PRODUCED" | "DELIVERED" | "VERIFIED";
  mealDate: Date;
  plannedAt: Date;
  producedAt: Date | null;
  deliveredAt: Date | null;
  verifiedAt: Date | null;
  deliveredBy: string | null;
  verifiedBy: string | null;
  deliveryPhotoUrl: string | null;
  programName: string;
  programType: string;
  contractId: string;
  contractName: string;
  funderName: string;
  marketLabel: string;
  cboName: string;
  memberRef: string | null;
  producerType: "KITCHEN" | "RESTAURANT";
  producerName: string | null;
  kitchenId: string | null;
  revenueCents: number;
  costCents: number;
  marginCents: number;
  marginPct: number;
  costByType: Record<CostType, number>;
}

/** One meal with its full lifecycle, provenance, costs, and unit economics. */
export async function getMealDetail(id: string): Promise<MealDetail | null> {
  const m = await prisma.meal.findUnique({
    where: { id },
    select: {
      id: true, status: true, mealDate: true, plannedAt: true, producedAt: true,
      deliveredAt: true, verifiedAt: true, deliveredBy: true, verifiedBy: true,
      deliveryPhotoUrl: true, producerType: true, contractId: true,
      program: { select: { name: true, type: true, reimbursementRateCents: true } },
      contract: { select: { name: true, funder: { select: { name: true } } } },
      market: { select: { borough: true, neighborhood: true } },
      cbo: { select: { name: true } },
      member: { select: { externalRef: true } },
      kitchen: { select: { id: true, name: true } },
      restaurantPartner: { select: { name: true } },
      costLineItems: { select: { type: true, amountCents: true } },
    },
  });
  if (!m) return null;
  const econ = mealEcon({
    reimbursementCents: m.program.reimbursementRateCents,
    costLineItems: m.costLineItems.map((c) => ({ type: c.type as CostType, amountCents: c.amountCents })),
  });
  return {
    id: m.id, status: m.status, mealDate: m.mealDate, plannedAt: m.plannedAt,
    producedAt: m.producedAt, deliveredAt: m.deliveredAt, verifiedAt: m.verifiedAt,
    deliveredBy: m.deliveredBy, verifiedBy: m.verifiedBy, deliveryPhotoUrl: m.deliveryPhotoUrl,
    programName: m.program.name, programType: m.program.type,
    contractId: m.contractId, contractName: m.contract.name, funderName: m.contract.funder.name,
    marketLabel: `${m.market.neighborhood}, ${m.market.borough}`,
    cboName: m.cbo.name, memberRef: m.member?.externalRef ?? null,
    producerType: m.producerType, producerName: m.kitchen?.name ?? m.restaurantPartner?.name ?? null,
    kitchenId: m.kitchen?.id ?? null,
    revenueCents: econ.revenueCents, costCents: econ.costCents,
    marginCents: econ.marginCents, marginPct: econ.marginPct, costByType: econ.costByType,
  };
}

export interface DeliveryFeedItem {
  id: string;
  status: "DELIVERED" | "VERIFIED";
  deliveredAt: Date | null;
  verifiedAt: Date | null;
  deliveredBy: string | null;
  verifiedBy: string | null;
  deliveryPhotoUrl: string | null;
  programName: string;
  cboName: string;
  marketLabel: string;
}

/** Most recent deliveries — the proof feed where field photos surface. */
export async function getRecentDeliveries(limit = 12): Promise<DeliveryFeedItem[]> {
  const rows = await prisma.meal.findMany({
    where: { deliveredAt: { not: null } },
    orderBy: { deliveredAt: "desc" },
    take: limit,
    select: {
      id: true, status: true, deliveredAt: true, verifiedAt: true,
      deliveredBy: true, verifiedBy: true, deliveryPhotoUrl: true,
      program: { select: { name: true } },
      cbo: { select: { name: true } },
      market: { select: { borough: true, neighborhood: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    status: r.status as "DELIVERED" | "VERIFIED",
    deliveredAt: r.deliveredAt, verifiedAt: r.verifiedAt,
    deliveredBy: r.deliveredBy, verifiedBy: r.verifiedBy, deliveryPhotoUrl: r.deliveryPhotoUrl,
    programName: r.program.name, cboName: r.cbo.name,
    marketLabel: `${r.market.neighborhood}, ${r.market.borough}`,
  }));
}

export interface InvoiceRow {
  id: string; periodStart: Date; periodEnd: Date; mealCount: number;
  amountCents: number; status: string; createdBy: string; createdAt: Date;
}
export interface ContractDetail {
  id: string; name: string; funderName: string; funderKind: string;
  programName: string; programType: string; scnPartner: string | null;
  budgetCents: number; startDate: Date; endDate: Date;
  billingDeadline: Date | null; lastInvoicedAt: Date | null;
  mealCount: number; realizedCount: number; verifiedCount: number;
  revenueCents: number; costCents: number; marginCents: number; marginPct: number;
  reimbursementRateCents: number;
  uninvoicedVerifiedCount: number; uninvoicedAmountCents: number;
  invoices: InvoiceRow[];
}

/** One contract with funder/program, economics, billing status, and invoices. */
export async function getContractDetail(id: string): Promise<ContractDetail | null> {
  const c = await prisma.contract.findUnique({
    where: { id },
    select: {
      id: true, name: true, budgetCents: true, startDate: true, endDate: true,
      billingDeadline: true, lastInvoicedAt: true, scnPartner: true,
      funder: { select: { name: true, kind: true } },
      program: { select: { name: true, type: true, reimbursementRateCents: true } },
      invoices: {
        orderBy: { createdAt: "desc" },
        select: { id: true, periodStart: true, periodEnd: true, mealCount: true, amountCents: true, status: true, createdBy: true, createdAt: true },
      },
      meals: {
        select: { status: true, verifiedAt: true, costLineItems: { select: { type: true, amountCents: true } } },
      },
    },
  });
  if (!c) return null;
  const rate = c.program.reimbursementRateCents;
  const realized = c.meals.filter((m) => isRealized(m.status));
  const roll = rollupMargin(
    realized.map((m) => ({ reimbursementCents: rate, costLineItems: m.costLineItems.map((x) => ({ type: x.type as CostType, amountCents: x.amountCents })) })),
  );
  const verified = c.meals.filter((m) => m.status === "VERIFIED");
  const uninvoiced = c.lastInvoicedAt
    ? verified.filter((m) => m.verifiedAt && m.verifiedAt.getTime() > c.lastInvoicedAt!.getTime())
    : verified;
  return {
    id: c.id, name: c.name, funderName: c.funder.name, funderKind: c.funder.kind,
    programName: c.program.name, programType: c.program.type, scnPartner: c.scnPartner,
    budgetCents: cents(c.budgetCents), startDate: c.startDate, endDate: c.endDate,
    billingDeadline: c.billingDeadline, lastInvoicedAt: c.lastInvoicedAt,
    mealCount: c.meals.length, realizedCount: realized.length, verifiedCount: verified.length,
    revenueCents: roll.revenueCents, costCents: roll.costCents,
    marginCents: roll.marginCents, marginPct: roll.marginPct,
    reimbursementRateCents: rate,
    uninvoicedVerifiedCount: uninvoiced.length,
    uninvoicedAmountCents: uninvoiced.length * rate,
    invoices: c.invoices.map((i) => ({
      id: i.id, periodStart: i.periodStart, periodEnd: i.periodEnd, mealCount: i.mealCount,
      amountCents: cents(i.amountCents), status: i.status, createdBy: i.createdBy, createdAt: i.createdAt,
    })),
  };
}

export interface KitchenDetail {
  id: string; name: string; marketLabel: string; weeklyCapacity: number;
  producedThisWeek: number; foodCostPerMealCents: number; foodBudgetPerMealCents: number;
  totalMeals: number; realizedCount: number;
  revenueCents: number; costCents: number; marginCents: number; marginPct: number;
  recentMeals: Array<{ id: string; status: string; mealDate: Date; cboName: string; marginCents: number }>;
}

/** One kitchen with capacity, food-cost posture, economics, and recent meals. */
export async function getKitchenDetail(id: string, now: Date = new Date()): Promise<KitchenDetail | null> {
  const k = await prisma.kitchen.findUnique({
    where: { id },
    select: {
      id: true, name: true, weeklyCapacity: true,
      market: { select: { borough: true, neighborhood: true } },
      meals: {
        select: {
          id: true, status: true, mealDate: true, producedAt: true,
          cbo: { select: { name: true } },
          program: { select: { reimbursementRateCents: true } },
          costLineItems: { select: { type: true, amountCents: true } },
        },
      },
    },
  });
  if (!k) return null;
  const weekAgo = now.getTime() - WEEK_MS;
  const econOf = (m: { program: { reimbursementRateCents: number }; costLineItems: { type: string; amountCents: number }[] }) =>
    mealEcon({
      reimbursementCents: m.program.reimbursementRateCents,
      costLineItems: m.costLineItems.map((c) => ({ type: c.type as CostType, amountCents: c.amountCents })),
    });
  const producedThisWeek = k.meals.filter((m) => m.producedAt && m.producedAt.getTime() >= weekAgo).length;
  const foodTotals = k.meals.reduce(
    (acc, m) => {
      const food = m.costLineItems.filter((c) => c.type === "FOOD").reduce((s, c) => s + c.amountCents, 0);
      return { food: acc.food + food, n: acc.n + 1 };
    },
    { food: 0, n: 0 },
  );
  const realizedMeals = k.meals.filter((m) => isRealized(m.status));
  const roll = rollupMargin(
    realizedMeals.map((m) => ({
      reimbursementCents: m.program.reimbursementRateCents,
      costLineItems: m.costLineItems.map((c) => ({ type: c.type as CostType, amountCents: c.amountCents })),
    })),
  );
  const recentMeals = [...k.meals]
    .sort((a, b) => b.mealDate.getTime() - a.mealDate.getTime())
    .slice(0, 10)
    .map((m) => ({
      id: m.id, status: m.status, mealDate: m.mealDate, cboName: m.cbo.name,
      marginCents: isRealized(m.status) ? econOf(m).marginCents : 0,
    }));
  return {
    id: k.id, name: k.name,
    marketLabel: `${k.market.neighborhood}, ${k.market.borough}`,
    weeklyCapacity: k.weeklyCapacity, producedThisWeek,
    foodCostPerMealCents: foodTotals.n ? Math.round(foodTotals.food / foodTotals.n) : 0,
    foodBudgetPerMealCents: FOOD_BUDGET_PER_MEAL_CENTS,
    totalMeals: k.meals.length, realizedCount: realizedMeals.length,
    revenueCents: roll.revenueCents, costCents: roll.costCents,
    marginCents: roll.marginCents, marginPct: roll.marginPct,
    recentMeals,
  };
}

export interface ExplorerFilters {
  status?: string; program?: string; contractId?: string; kitchenId?: string; q?: string;
  intakeRequestId?: string;
}
export interface ExplorerRow {
  id: string; status: string; mealDate: Date; programName: string;
  cboName: string; marketLabel: string; producerName: string | null;
  realized: boolean; marginCents: number;
}
export interface ExplorerResult { rows: ExplorerRow[]; total: number; capped: boolean; }

/** Filterable records view — the bridge from an aggregate KPI to the rows. */
export async function getMealsExplorer(f: ExplorerFilters = {}): Promise<ExplorerResult> {
  const where: Prisma.MealWhereInput = {};
  if (f.status) where.status = f.status as Prisma.MealWhereInput["status"];
  if (f.program) where.program = { name: f.program };
  if (f.contractId) where.contractId = f.contractId;
  if (f.kitchenId) where.kitchenId = f.kitchenId;
  if (f.q) where.cbo = { name: { contains: f.q, mode: "insensitive" } };
  if (f.intakeRequestId) where.intakeRequestId = f.intakeRequestId;

  const LIMIT = 200;
  const [total, rows] = await Promise.all([
    prisma.meal.count({ where }),
    prisma.meal.findMany({
      where,
      orderBy: { mealDate: "desc" },
      take: LIMIT,
      select: {
        id: true, status: true, mealDate: true,
        program: { select: { name: true, reimbursementRateCents: true } },
        cbo: { select: { name: true } },
        market: { select: { borough: true, neighborhood: true } },
        kitchen: { select: { name: true } },
        restaurantPartner: { select: { name: true } },
        costLineItems: { select: { type: true, amountCents: true } },
      },
    }),
  ]);

  return {
    total,
    capped: total > LIMIT,
    rows: rows.map((r) => {
      const realized = isRealized(r.status);
      const econ = mealEcon({
        reimbursementCents: r.program.reimbursementRateCents,
        costLineItems: r.costLineItems.map((c) => ({ type: c.type as CostType, amountCents: c.amountCents })),
      });
      return {
        id: r.id, status: r.status, mealDate: r.mealDate, programName: r.program.name,
        cboName: r.cbo.name, marketLabel: `${r.market.neighborhood}, ${r.market.borough}`,
        producerName: r.kitchen?.name ?? r.restaurantPartner?.name ?? null,
        realized, marginCents: realized ? econ.marginCents : 0,
      };
    }),
  };
}
