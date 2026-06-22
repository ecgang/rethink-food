// The "act on today" engine. Pure, deterministic rules (no ML) — each one turns a
// data condition into an operator action with a reason code, a severity, and a
// concrete recommended action. This is what makes the dashboard an operating tool
// rather than a passive report. `now` is injected for deterministic testing.

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ExceptionItem {
  reasonCode: string;
  severity: Severity;
  entityType: "Meal" | "Kitchen" | "Contract" | "Member" | "Incident" | "SafetyCheck";
  entityId: string;
  title: string;
  detail: string;
  recommendedAction: string;
}

export interface MealSnapshot {
  id: string;
  status: "PLANNED" | "PRODUCED" | "DELIVERED" | "VERIFIED";
  mealDate: Date;
  producedAt: Date | null;
  deliveredAt: Date | null;
  programName: string;
  cboName: string;
}

export interface KitchenSnapshot {
  id: string;
  name: string;
  weeklyCapacity: number;
  producedThisWeek: number;
  // blended actual vs. budgeted food cost per meal (cents)
  foodCostPerMealCents: number;
  foodBudgetPerMealCents: number;
}

export interface ContractSnapshot {
  id: string;
  name: string;
  funderName: string;
  billingDeadline: Date | null;
  // when an invoice was last generated; suppresses the billing exception for the
  // current cycle so generating an invoice clears the "act on today" item.
  lastInvoicedAt: Date | null;
}

// An open incident logged from the kitchen/field. Only HIGH/CRITICAL open ones
// rise to "act on today"; lower-severity incidents live on the field log.
export interface IncidentSnapshot {
  id: string;
  kind: string; // human label, e.g. "Equipment"
  severity: Severity;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  title: string;
  kitchenName: string | null;
}

// A recent food-safety / QA checklist result. A recent failed one is actionable.
export interface SafetyCheckSnapshot {
  id: string;
  kind: "FOOD_SAFETY" | "QUALITY";
  passed: boolean;
  checkedAt: Date;
  kitchenName: string | null;
}

export interface ExceptionInput {
  meals: MealSnapshot[];
  kitchens: KitchenSnapshot[];
  contracts: ContractSnapshot[];
  // kitchen & field ops (optional so existing callers/tests need no change)
  incidents?: IncidentSnapshot[];
  safetyChecks?: SafetyCheckSnapshot[];
  now: Date;
}

// ---- tunable thresholds (kept explicit so reviewers can see the policy) ------
const PRODUCED_NOT_DELIVERED_HOURS = 24;
const DELIVERED_NOT_VERIFIED_HOURS = 48;
const FOOD_BUDGET_OVERAGE_PCT = 0.2; // 20% over budget
const CAPACITY_UNDERUTILIZED_PCT = 0.6; // produced < 60% of capacity
const BILLING_DUE_SOON_DAYS = 3;
const INVOICE_CLEARS_BILLING_DAYS = 25; // an invoice this recent covers the cycle
const SAFETY_CHECK_RECENT_HOURS = 72; // a failed check older than this has aged out

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function detectExceptions(input: ExceptionInput): ExceptionItem[] {
  const out: ExceptionItem[] = [];
  const { now } = input;

  for (const meal of input.meals) {
    // Meals produced but stuck before delivery.
    if (meal.status === "PRODUCED" && meal.producedAt) {
      const hours = (now.getTime() - meal.producedAt.getTime()) / HOUR_MS;
      if (hours >= PRODUCED_NOT_DELIVERED_HOURS) {
        out.push({
          reasonCode: "PRODUCED_NOT_DELIVERED",
          severity: hours >= PRODUCED_NOT_DELIVERED_HOURS * 2 ? "CRITICAL" : "HIGH",
          entityType: "Meal",
          entityId: meal.id,
          title: `Meal produced ${Math.floor(hours)}h ago, not delivered`,
          detail: `${meal.programName} meal for ${meal.cboName} has been produced but not delivered.`,
          recommendedAction: `Dispatch delivery to ${meal.cboName} or flag the route as blocked.`,
        });
      }
    }
    // Delivered but never confirmed received — a reimbursement/audit risk.
    if (meal.status === "DELIVERED" && meal.deliveredAt) {
      const hours = (now.getTime() - meal.deliveredAt.getTime()) / HOUR_MS;
      if (hours >= DELIVERED_NOT_VERIFIED_HOURS) {
        out.push({
          reasonCode: "DELIVERED_NOT_VERIFIED",
          severity: "MEDIUM",
          entityType: "Meal",
          entityId: meal.id,
          title: `Delivery unverified for ${Math.floor(hours)}h`,
          detail: `${meal.cboName} has not confirmed receipt; meal cannot be billed until verified.`,
          recommendedAction: `Contact ${meal.cboName} to confirm receipt and close out verification.`,
        });
      }
    }
  }

  for (const k of input.kitchens) {
    // Food cost running over budget.
    if (k.foodBudgetPerMealCents > 0) {
      const overage =
        (k.foodCostPerMealCents - k.foodBudgetPerMealCents) /
        k.foodBudgetPerMealCents;
      if (overage >= FOOD_BUDGET_OVERAGE_PCT) {
        out.push({
          reasonCode: "KITCHEN_OVER_FOOD_BUDGET",
          severity: overage >= FOOD_BUDGET_OVERAGE_PCT * 2 ? "HIGH" : "MEDIUM",
          entityType: "Kitchen",
          entityId: k.id,
          title: `${k.name} is ${Math.round(overage * 100)}% over food budget`,
          detail: `Actual food cost/meal is over the budgeted target, compressing contribution margin.`,
          recommendedAction: `Review ${k.name}'s menu/sourcing this week; renegotiate or substitute high-cost ingredients.`,
        });
      }
    }
    // Kitchen under capacity — unfulfilled demand we are paying fixed cost for.
    if (k.weeklyCapacity > 0) {
      const util = k.producedThisWeek / k.weeklyCapacity;
      if (util < CAPACITY_UNDERUTILIZED_PCT) {
        out.push({
          reasonCode: "KITCHEN_UNDER_CAPACITY",
          severity: "LOW",
          entityType: "Kitchen",
          entityId: k.id,
          title: `${k.name} at ${Math.round(util * 100)}% capacity`,
          detail: `Producing ${k.producedThisWeek} of ${k.weeklyCapacity} weekly meal capacity.`,
          recommendedAction: `Route additional funded demand to ${k.name} to absorb fixed cost.`,
        });
      }
    }
  }

  for (const c of input.contracts) {
    // Skip contracts already invoiced this cycle — the loop is closed.
    const invoicedRecently =
      c.lastInvoicedAt != null &&
      (now.getTime() - c.lastInvoicedAt.getTime()) / DAY_MS < INVOICE_CLEARS_BILLING_DAYS;
    if (c.billingDeadline && !invoicedRecently) {
      const days = (c.billingDeadline.getTime() - now.getTime()) / DAY_MS;
      if (days <= BILLING_DUE_SOON_DAYS) {
        const overdue = days < 0;
        out.push({
          reasonCode: overdue ? "CONTRACT_BILLING_OVERDUE" : "CONTRACT_BILLING_DUE",
          severity: overdue ? "CRITICAL" : "HIGH",
          entityType: "Contract",
          entityId: c.id,
          title: overdue
            ? `Billing overdue: ${c.name}`
            : `Billing due in ${Math.ceil(days)}d: ${c.name}`,
          detail: `${c.funderName} invoice window ${overdue ? "has closed" : "is closing"}; unbilled verified meals risk non-reimbursement.`,
          recommendedAction: `Generate and submit the ${c.funderName} invoice for all verified meals now.`,
        });
      }
    }
  }

  // Open, high-severity incidents from the kitchen/field demand attention today.
  for (const inc of input.incidents ?? []) {
    const open = inc.status === "OPEN" || inc.status === "ACKNOWLEDGED";
    if (open && (inc.severity === "HIGH" || inc.severity === "CRITICAL")) {
      const where = inc.kitchenName ? ` at ${inc.kitchenName}` : "";
      out.push({
        reasonCode: "INCIDENT_OPEN",
        severity: inc.severity,
        entityType: "Incident",
        entityId: inc.id,
        title: `${inc.severity === "CRITICAL" ? "Critical" : "High"} incident: ${inc.title}`,
        detail: `An open ${inc.kind.toLowerCase()} incident${where} is unresolved.`,
        recommendedAction: `Resolve or escalate the incident; draft a partner notice if deliveries are affected.`,
      });
    }
  }

  // A recent failed food-safety / QA check is a compliance and quality risk.
  for (const sc of input.safetyChecks ?? []) {
    if (sc.passed) continue;
    const hours = (now.getTime() - sc.checkedAt.getTime()) / HOUR_MS;
    if (hours > SAFETY_CHECK_RECENT_HOURS) continue;
    const where = sc.kitchenName ? ` at ${sc.kitchenName}` : "";
    const isFood = sc.kind === "FOOD_SAFETY";
    out.push({
      reasonCode: "SAFETY_CHECK_FAILED",
      severity: isFood ? "HIGH" : "MEDIUM",
      entityType: "SafetyCheck",
      entityId: sc.id,
      title: `Failed ${isFood ? "food-safety" : "quality"} check${where}`,
      detail: `A ${isFood ? "food-safety" : "quality-assurance"} checklist failed its required items.`,
      recommendedAction: `Take corrective action and re-run the check; log an incident if it can't be cleared.`,
    });
  }

  return out.sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );
}

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1,
  LOW: 0,
};
