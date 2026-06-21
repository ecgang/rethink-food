import { prisma } from "@/lib/db";
import {
  marginByDimension,
  rollupMargin,
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
      select: { id: true, name: true, billingDeadline: true, funder: { select: { name: true } } },
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

  const scns = ["PHS", "HEALI", "SOMOS"];
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
