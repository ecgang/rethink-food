// Canonical metric definitions — the single source of truth for what each term
// MEANS across the whole product. The dashboard renders these (Definitions panel),
// the data dictionary documents them, and tests/metrics.test.ts enforces that every
// view computes them the same way. This is the "everyone agrees what a meal is" layer.
//
// LOAD-BEARING PRIMITIVES — every compute path imports from here so JS predicates
// and SQL fragments cannot drift from one another.

/** The two statuses that make a meal "realized" (billable). */
export const REALIZED_STATUSES = ["DELIVERED", "VERIFIED"] as const;

/** Returns true iff the meal status counts toward revenue and margin. */
export function isRealized(status: string): boolean {
  return (REALIZED_STATUSES as readonly string[]).includes(status);
}

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

/** Target food cost per meal (cents) — the "over food budget" exception threshold. */
export const FOOD_BUDGET_PER_MEAL_CENTS = 420;

export interface MetricDefinition {
  term: string;
  short: string;
  formula: string;
}

export const DEFINITIONS: MetricDefinition[] = [
  {
    term: "Meal",
    short:
      "One prepared meal for one recipient on one date, moving through an explicit lifecycle.",
    formula: "Meal { status, mealDate, plannedAt, producedAt, deliveredAt, verifiedAt }",
  },
  {
    term: "Realized / billable",
    short:
      "A meal counts toward revenue & margin only once delivered or verified. Planned & in-production meals are volume, not money.",
    formula: "realized = status ∈ {DELIVERED, VERIFIED}",
  },
  {
    term: "Cost",
    short:
      "Sum of a meal's line items — food, labor, transport, overhead. Never a single flat total.",
    formula: "cost = Σ lineItem.amount  (FOOD + LABOR + TRANSPORT + OVERHEAD)",
  },
  {
    term: "Revenue",
    short: "Reimbursement earned per realized meal, set by the meal's program.",
    formula: "revenue = program.reimbursementRate × realized meals",
  },
  {
    term: "Contribution margin",
    short:
      "Revenue minus cost, per realized meal and aggregated. Can be negative. Blended = across all programs; per-program is a subset.",
    formula: "margin = revenue − cost ;  margin% = margin ÷ revenue",
  },
  {
    term: "Fulfillment (MTM)",
    short:
      "Medically Tailored Meals delivered in the last 7 days vs. meals prescribed per week for active members.",
    formula: "fulfillment = MTM delivered (7d) ÷ Σ active member prescribedMealsPerWeek",
  },
  {
    term: "Exception",
    short:
      "A data condition an operator should act on, with a reason code, severity, and recommended action.",
    formula: "deterministic thresholds → { reasonCode, severity, recommendedAction }",
  },
];
