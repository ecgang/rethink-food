// Field operations — the frontline operator's view of the meal lifecycle.
//
// Pure module (no Prisma, no next/*) so it's unit-testable and safe to import
// from client components. It turns raw meal rows into an ordered "what to do
// next in the field" queue and derives the verification rate the hero shows.
//
// The overdue thresholds intentionally MIRROR the "act on today" exception
// engine (see lib/exceptions.ts: PRODUCED_NOT_DELIVERED_HOURS = 24,
// DELIVERED_NOT_VERIFIED_HOURS = 48) so the field queue and the Command Center
// feed agree on what is late. Advancing a meal here clears the matching
// exception there, because that feed is recomputed from live meal state.

export type MealStatus = "PLANNED" | "PRODUCED" | "DELIVERED" | "VERIFIED";

/** The next action a field operator can take on a meal. */
export type FieldStage = "produce" | "deliver" | "verify";

const HOUR_MS = 60 * 60 * 1000;

/** Hours in PRODUCED before delivery is considered late. Mirrors exceptions.ts. */
export const DELIVER_OVERDUE_HOURS = 24;
/** Hours in DELIVERED before verification is considered late. Mirrors exceptions.ts. */
export const VERIFY_OVERDUE_HOURS = 48;

/** A meal flattened to what the field app needs. */
export interface FieldMeal {
  id: string;
  status: MealStatus;
  programName: string;
  cboName: string;
  marketLabel: string;
  kitchenName: string | null;
  // the day the meal is for; a PLANNED meal due today (or earlier) is overdue to produce
  mealDate: Date;
  plannedAt: Date | null;
  producedAt: Date | null;
  deliveredAt: Date | null;
  deliveryPhotoUrl: string | null;
}

/** A meal that has an actionable next step, with urgency derived. */
export interface FieldItem extends FieldMeal {
  stage: FieldStage;
  /** hours since the meal entered its current (actionable) state */
  ageHours: number;
  /** has it crossed the act-on-today threshold for this stage? */
  overdue: boolean;
}

/** The next field action for a status, or null if nothing to do (done). */
export function fieldStageFor(status: MealStatus): FieldStage | null {
  if (status === "PLANNED") return "produce";
  if (status === "PRODUCED") return "deliver";
  if (status === "DELIVERED") return "verify";
  return null;
}

function ageHoursFor(meal: FieldMeal, stage: FieldStage, now: Date): number {
  // age is measured from the timestamp that put the meal into its current state
  const since =
    stage === "produce" ? meal.plannedAt : stage === "deliver" ? meal.producedAt : meal.deliveredAt;
  if (!since) return 0;
  return Math.max(0, (now.getTime() - since.getTime()) / HOUR_MS);
}

/**
 * Is the next action late? PRODUCE is judged against the meal's *date* — a meal
 * due today or earlier that hasn't been produced is overdue — while DELIVER and
 * VERIFY are judged against hours-in-state, mirroring the exception engine.
 */
function isOverdue(meal: FieldMeal, stage: FieldStage, ageHours: number, now: Date): boolean {
  if (stage === "produce") return now.getTime() >= meal.mealDate.getTime();
  const threshold = stage === "deliver" ? DELIVER_OVERDUE_HOURS : VERIFY_OVERDUE_HOURS;
  return ageHours >= threshold;
}

/** Lift a meal into a FieldItem, or null if it has no actionable next step. */
export function toFieldItem(meal: FieldMeal, now: Date): FieldItem | null {
  const stage = fieldStageFor(meal.status);
  if (!stage) return null;
  const ageHours = ageHoursFor(meal, stage, now);
  return { ...meal, stage, ageHours, overdue: isOverdue(meal, stage, ageHours, now) };
}

/**
 * Build the operator queue: only actionable meals, overdue first. Within the
 * non-overdue tier, the VERIFY stage is sorted most-recently-delivered first —
 * so a meal you just delivered is ready to verify at the top of the list, not
 * buried at the bottom. Everything else (overdue items, and the DELIVER backlog)
 * stays oldest-first, so the longest-waiting action is on top.
 */
export function buildFieldQueue(meals: FieldMeal[], now: Date): FieldItem[] {
  return meals
    .map((m) => toFieldItem(m, now))
    .filter((i): i is FieldItem => i !== null)
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      // Just-delivered verify items rise to the top of the non-overdue tier.
      if (a.stage === "verify" && b.stage === "verify" && !a.overdue && !b.overdue) {
        return a.ageHours - b.ageHours; // newest delivered first
      }
      return b.ageHours - a.ageHours; // oldest first
    });
}

/**
 * Share of delivered meals that have been verified — the closure rate of the
 * produced→delivered→verified loop. Denominator is meals that have reached at
 * least DELIVERED (DELIVERED or VERIFIED); returns 0 when none have.
 */
export function verificationRate(statuses: MealStatus[]): number {
  let realized = 0;
  let verified = 0;
  for (const s of statuses) {
    if (s === "DELIVERED" || s === "VERIFIED") realized += 1;
    if (s === "VERIFIED") verified += 1;
  }
  return realized === 0 ? 0 : verified / realized;
}

/** Today's field workload, counted by the action each item needs. */
export interface ProductionSummary {
  produce: number;
  deliver: number;
  verify: number;
  overdue: number;
  total: number;
}

/** Count the operator queue by stage — the field app's "meal counts" header. */
export function productionSummary(items: FieldItem[]): ProductionSummary {
  const s: ProductionSummary = { produce: 0, deliver: 0, verify: 0, overdue: 0, total: items.length };
  for (const i of items) {
    s[i.stage] += 1;
    if (i.overdue) s.overdue += 1;
  }
  return s;
}
