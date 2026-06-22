import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  marginByDimension,
  rollupMargin,
  mealEcon,
  type MealEconInput,
  type CostType,
} from "@/lib/margin";
import {
  detectExceptions,
  type ExceptionItem,
  type MealSnapshot,
  type KitchenSnapshot,
  type ContractSnapshot,
} from "@/lib/exceptions";
import {
  buildFieldQueue,
  verificationRate,
  type FieldItem,
  type FieldMeal,
} from "@/lib/field";

const DAY = 24 * 3600 * 1000;
// Target food cost per meal used to evaluate kitchens (cents). Kept here as the
// single policy knob for the "over food budget" exception.
const FOOD_BUDGET_PER_MEAL_CENTS = 420;

/** A meal flattened to everything the dashboard needs, including econ + dims. */
interface EconMeal extends MealEconInput {
  id: string;
  status: "PLANNED" | "PRODUCED" | "DELIVERED" | "VERIFIED";
  mealDate: Date;
  producedAt: Date | null;
  deliveredAt: Date | null;
  programName: string;
  programType: string;
  kitchenId: string | null;
  kitchenName: string | null;
  restaurantName: string | null;
  contractId: string;
  contractName: string;
  marketLabel: string;
  scnPartner: string | null;
  cboName: string;
}

async function loadEconMeals(): Promise<EconMeal[]> {
  const meals = await prisma.meal.findMany({
    select: {
      id: true,
      status: true,
      mealDate: true,
      producedAt: true,
      deliveredAt: true,
      contractId: true,
      program: { select: { name: true, type: true, reimbursementRateCents: true } },
      contract: { select: { name: true, scnPartner: true } },
      kitchen: { select: { id: true, name: true } },
      restaurantPartner: { select: { name: true } },
      market: { select: { borough: true, neighborhood: true } },
      cbo: { select: { name: true } },
      costLineItems: { select: { type: true, amountCents: true } },
    },
  });

  return meals.map((m) => ({
    id: m.id,
    status: m.status,
    mealDate: m.mealDate,
    producedAt: m.producedAt,
    deliveredAt: m.deliveredAt,
    programName: m.program.name,
    programType: m.program.type,
    kitchenId: m.kitchen?.id ?? null,
    kitchenName: m.kitchen?.name ?? null,
    restaurantName: m.restaurantPartner?.name ?? null,
    contractId: m.contractId,
    contractName: m.contract.name,
    marketLabel: `${m.market.neighborhood}, ${m.market.borough}`,
    scnPartner: m.contract.scnPartner ?? null,
    cboName: m.cbo.name,
    reimbursementCents: m.program.reimbursementRateCents,
    costLineItems: m.costLineItems.map((c) => ({
      type: c.type as CostType,
      amountCents: c.amountCents,
    })),
  }));
}

// Revenue is only realized once a meal is delivered/verified; before that it is
// planned/in-production. We treat DELIVERED+VERIFIED as "billable" for margin.
const isRealized = (s: EconMeal["status"]) => s === "DELIVERED" || s === "VERIFIED";

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

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  program: "Program",
  kitchen: "Kitchen",
  restaurant: "Restaurant partner",
  contract: "Contract / funder",
  market: "Market",
};

function dimensionKeyOf(dim: DimensionKey, m: EconMeal): string | null {
  switch (dim) {
    case "program":
      return m.programName;
    case "kitchen":
      return m.kitchenName;
    case "restaurant":
      return m.restaurantName;
    case "contract":
      return m.contractName;
    case "market":
      return m.marketLabel;
  }
}

export async function getDashboardData(
  dim: DimensionKey = "program",
): Promise<DashboardData> {
  const meals = await loadEconMeals();

  const funnel = { planned: 0, produced: 0, delivered: 0, verified: 0 };
  for (const m of meals) {
    // funnel is cumulative: a verified meal also "passed through" earlier stages
    funnel.planned += 1;
    if (m.status === "PRODUCED" || m.status === "DELIVERED" || m.status === "VERIFIED")
      funnel.produced += 1;
    if (m.status === "DELIVERED" || m.status === "VERIFIED") funnel.delivered += 1;
    if (m.status === "VERIFIED") funnel.verified += 1;
  }

  // Unit economics computed on realized (billable) meals only.
  const realized = meals.filter((m) => isRealized(m.status));
  const totals = rollupMargin(realized);

  const grouped = marginByDimension(
    realized.filter((m) => dimensionKeyOf(dim, m) !== null),
    (m) => dimensionKeyOf(dim, m)!,
  ).map((g) => ({
    key: g.key,
    mealCount: g.mealCount,
    revenueCents: g.revenueCents,
    costCents: g.costCents,
    marginCents: g.marginCents,
    marginPct: g.marginPct,
  }));

  return {
    totals: {
      mealCount: totals.mealCount,
      revenueCents: totals.revenueCents,
      costCents: totals.costCents,
      marginCents: totals.marginCents,
      marginPct: totals.marginPct,
    },
    funnel,
    costByType: totals.costByType,
    dimensionLabel: DIMENSION_LABELS[dim],
    marginByDimension: grouped,
  };
}

/** The "act on today" feed — runs the exception engine against live data. */
export async function getActOnToday(now: Date = new Date()): Promise<ExceptionItem[]> {
  const [meals, kitchensRaw, contractsRaw] = await Promise.all([
    loadEconMeals(),
    prisma.kitchen.findMany({ select: { id: true, name: true, weeklyCapacity: true } }),
    prisma.contract.findMany({
      select: {
        id: true,
        name: true,
        billingDeadline: true,
        lastInvoicedAt: true,
        funder: { select: { name: true } },
      },
    }),
  ]);

  const mealSnapshots: MealSnapshot[] = meals.map((m) => ({
    id: m.id,
    status: m.status,
    mealDate: m.mealDate,
    producedAt: m.producedAt,
    deliveredAt: m.deliveredAt,
    programName: m.programName,
    cboName: m.cboName,
  }));

  const weekAgo = now.getTime() - 7 * DAY;
  const kitchenSnapshots: KitchenSnapshot[] = kitchensRaw.map((k) => {
    const kMeals = meals.filter((m) => m.kitchenId === k.id);
    const producedThisWeek = kMeals.filter(
      (m) => m.producedAt && m.producedAt.getTime() >= weekAgo,
    ).length;
    const foodTotals = kMeals.reduce(
      (acc, m) => {
        const food = m.costLineItems
          .filter((c) => c.type === "FOOD")
          .reduce((s, c) => s + c.amountCents, 0);
        return { food: acc.food + food, n: acc.n + 1 };
      },
      { food: 0, n: 0 },
    );
    return {
      id: k.id,
      name: k.name,
      weeklyCapacity: k.weeklyCapacity,
      producedThisWeek,
      foodCostPerMealCents: foodTotals.n ? Math.round(foodTotals.food / foodTotals.n) : 0,
      foodBudgetPerMealCents: FOOD_BUDGET_PER_MEAL_CENTS,
    };
  });

  const contractSnapshots: ContractSnapshot[] = contractsRaw.map((c) => ({
    id: c.id,
    name: c.name,
    funderName: c.funder.name,
    billingDeadline: c.billingDeadline,
    lastInvoicedAt: c.lastInvoicedAt,
  }));

  return detectExceptions({
    meals: mealSnapshots,
    kitchens: kitchenSnapshots,
    contracts: contractSnapshots,
    now,
  });
}

export interface KpiDeltas {
  /** signed fraction change, current 7d vs prior 7d */
  mealsPct: number;
  marginPct: number;
  marginPerMealPct: number;
}

/**
 * Recent momentum: current 7-day window vs. the prior 7-day window, on realized
 * (delivered/verified) meals. Lets a leader see direction, not just a static total.
 */
export async function getKpiDeltas(now: Date = new Date()): Promise<KpiDeltas> {
  const meals = (await loadEconMeals()).filter((m) => isRealized(m.status));
  const curStart = now.getTime() - 7 * DAY;
  const priorStart = now.getTime() - 14 * DAY;

  const inWindow = (m: (typeof meals)[number], start: number, end: number) =>
    m.deliveredAt != null &&
    m.deliveredAt.getTime() >= start &&
    m.deliveredAt.getTime() < end;

  const cur = rollupMargin(meals.filter((m) => inWindow(m, curStart, now.getTime())));
  const prior = rollupMargin(meals.filter((m) => inWindow(m, priorStart, curStart)));

  const pct = (c: number, p: number) => (p === 0 ? 0 : (c - p) / p);
  const curPerMeal = cur.mealCount ? cur.marginCents / cur.mealCount : 0;
  const priorPerMeal = prior.mealCount ? prior.marginCents / prior.mealCount : 0;

  return {
    mealsPct: pct(cur.mealCount, prior.mealCount),
    marginPct: pct(cur.marginCents, prior.marginCents),
    marginPerMealPct: pct(curPerMeal, priorPerMeal),
  };
}

export interface MarqueeStats {
  deliveredThisWeek: number;
  contributionMonthCents: number;
  pendingIntake: number;
}

/** Small live figures for the editorial marquee bar. */
export async function getMarqueeStats(now: Date = new Date()): Promise<MarqueeStats> {
  const [meals, pendingIntake] = await Promise.all([
    loadEconMeals(),
    prisma.intakeRequest.count({ where: { status: "PENDING" } }),
  ]);
  const weekAgo = now.getTime() - 7 * DAY;
  const monthAgo = now.getTime() - 30 * DAY;
  const realized = meals.filter((m) => isRealized(m.status));
  const deliveredThisWeek = realized.filter(
    (m) => m.deliveredAt && m.deliveredAt.getTime() >= weekAgo,
  ).length;
  const monthMeals = realized.filter(
    (m) => m.deliveredAt && m.deliveredAt.getTime() >= monthAgo,
  );
  return {
    deliveredThisWeek,
    contributionMonthCents: rollupMargin(monthMeals).marginCents,
    pendingIntake,
  };
}

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
  const weekAgo = new Date(now.getTime() - 7 * DAY);
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
export async function getMtmReporting(now: Date = new Date()): Promise<MtmReporting> {
  const [members, meals] = await Promise.all([
    prisma.member.findMany({
      select: { status: true, scnPartner: true, prescribedMealsPerWeek: true },
    }),
    loadEconMeals(),
  ]);

  const active = members.filter((m) => m.status === "ACTIVE");
  const withdrawn = members.filter((m) => m.status === "WITHDRAWN");
  const prescribedPerWeek = active.reduce((s, m) => s + m.prescribedMealsPerWeek, 0);

  const weekAgo = now.getTime() - 7 * DAY;
  const mtmMeals = meals.filter((m) => m.programType === "MTM");
  const deliveredLast7 = mtmMeals.filter(
    (m) => isRealized(m.status) && m.deliveredAt && m.deliveredAt.getTime() >= weekAgo,
  ).length;

  const scns = ["PHS", "SOMOS", "SIPPS"];
  const byScn = scns.map((scn) => {
    const scnMembers = active.filter((m) => m.scnPartner === scn).length;
    const scnMeals = mtmMeals.filter((m) => m.scnPartner === scn && isRealized(m.status));
    const delivered7 = scnMeals.filter(
      (m) => m.deliveredAt && m.deliveredAt.getTime() >= weekAgo,
    ).length;
    const roll = rollupMargin(scnMeals);
    return {
      scn,
      members: scnMembers,
      deliveredLast7: delivered7,
      marginCents: roll.marginCents,
      marginPct: roll.marginPct,
    };
  });

  return {
    activeMembers: active.length,
    withdrawnMembers: withdrawn.length,
    retentionPct: members.length ? active.length / members.length : 0,
    prescribedPerWeek,
    deliveredLast7,
    fulfillmentPct: prescribedPerWeek ? deliveredLast7 / prescribedPerWeek : 0,
    byScn,
  };
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
      kitchens: { select: { weeklyCapacity: true } },
      restaurants: { select: { weeklyCapacity: true } },
      meals: {
        where: { deliveredAt: { gte: new Date(now.getTime() - 7 * DAY) } },
        select: { id: true },
      },
    },
  });

  return markets.map((m) => {
    const weeklyCapacity =
      m.kitchens.reduce((s, k) => s + k.weeklyCapacity, 0) +
      m.restaurants.reduce((s, r) => s + r.weeklyCapacity, 0);
    const fulfilledLast7 = m.meals.length;
    return {
      borough: m.borough,
      neighborhood: m.neighborhood,
      lat: m.lat,
      lng: m.lng,
      weeklyDemand: m.weeklyDemand,
      weeklyCapacity,
      fulfilledLast7,
      unmet: Math.max(0, m.weeklyDemand - fulfilledLast7),
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
  const weekAgo = now.getTime() - 7 * DAY;
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
      const realized = r.status === "DELIVERED" || r.status === "VERIFIED";
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
