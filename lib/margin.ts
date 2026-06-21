// Unit-economics core. Pure functions, no database access — so they are trivially
// testable and define exactly what "cost", "revenue", and "contribution margin"
// mean across the whole application (see docs/ARCHITECTURE.md data dictionary).

export type CostType = "FOOD" | "LABOR" | "TRANSPORT" | "OVERHEAD";

export interface CostLineItem {
  type: CostType;
  amountCents: number;
}

/** A meal reduced to just what unit economics needs. */
export interface MealEconInput {
  /** Revenue: what Rethink is reimbursed for this meal (from its program). */
  reimbursementCents: number;
  costLineItems: CostLineItem[];
}

export interface MealEcon {
  revenueCents: number;
  costCents: number;
  /** Contribution margin in cents = revenue - cost. Can be negative. */
  marginCents: number;
  /** Margin as a fraction of revenue. 0 when revenue is 0. */
  marginPct: number;
  costByType: Record<CostType, number>;
}

const COST_TYPES: CostType[] = ["FOOD", "LABOR", "TRANSPORT", "OVERHEAD"];

/** Total cost for a single meal = sum of its line items. */
export function mealCostCents(items: CostLineItem[]): number {
  return items.reduce((sum, i) => sum + i.amountCents, 0);
}

/** Compute the full unit economics for a single meal. */
export function mealEcon(meal: MealEconInput): MealEcon {
  const costByType = emptyCostByType();
  for (const item of meal.costLineItems) {
    costByType[item.type] += item.amountCents;
  }
  const costCents = mealCostCents(meal.costLineItems);
  const revenueCents = meal.reimbursementCents;
  const marginCents = revenueCents - costCents;
  return {
    revenueCents,
    costCents,
    marginCents,
    marginPct: revenueCents === 0 ? 0 : marginCents / revenueCents,
    costByType,
  };
}

export interface MarginRollup {
  mealCount: number;
  revenueCents: number;
  costCents: number;
  marginCents: number;
  marginPct: number;
  costByType: Record<CostType, number>;
}

/** Aggregate many meals into a single rollup (totals + blended margin). */
export function rollupMargin(meals: MealEconInput[]): MarginRollup {
  const acc: MarginRollup = {
    mealCount: 0,
    revenueCents: 0,
    costCents: 0,
    marginCents: 0,
    marginPct: 0,
    costByType: emptyCostByType(),
  };
  for (const meal of meals) {
    const e = mealEcon(meal);
    acc.mealCount += 1;
    acc.revenueCents += e.revenueCents;
    acc.costCents += e.costCents;
    acc.marginCents += e.marginCents;
    for (const t of COST_TYPES) acc.costByType[t] += e.costByType[t];
  }
  acc.marginPct = acc.revenueCents === 0 ? 0 : acc.marginCents / acc.revenueCents;
  return acc;
}

/**
 * Group meals by an arbitrary dimension key (program, kitchen, restaurant,
 * contract, market…) and roll up margin within each group. Returns groups
 * sorted by descending meal count.
 */
export function marginByDimension<T extends MealEconInput>(
  meals: T[],
  keyOf: (meal: T) => string,
): Array<{ key: string } & MarginRollup> {
  const groups = new Map<string, T[]>();
  for (const meal of meals) {
    const key = keyOf(meal);
    const list = groups.get(key);
    if (list) list.push(meal);
    else groups.set(key, [meal]);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, ...rollupMargin(list) }))
    .sort((a, b) => b.mealCount - a.mealCount);
}

function emptyCostByType(): Record<CostType, number> {
  return { FOOD: 0, LABOR: 0, TRANSPORT: 0, OVERHEAD: 0 };
}
