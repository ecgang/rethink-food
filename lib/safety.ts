// Pure logic for food-safety and quality-assurance checklists.
// No Prisma, no Next.js imports — fully unit-testable.

export type SafetyCheckKind = "FOOD_SAFETY" | "QUALITY";

export interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
}

export const CHECKLISTS: Record<SafetyCheckKind, ChecklistItem[]> = {
  FOOD_SAFETY: [
    { id: "cold-holding-logged",  label: "Cold-holding temp logged",          required: true  },
    { id: "handwashing-gloves",   label: "Handwashing & gloves in use",       required: true  },
    { id: "labeling-date-mark",   label: "Labeling & date-marking complete",  required: true  },
    { id: "allergen-separation",  label: "Allergen separation verified",      required: true  },
    { id: "sanitizer-stocked",    label: "Sanitizer station stocked",         required: false },
  ],
  QUALITY: [
    { id: "portion-correct",    label: "Portion size correct",         required: true  },
    { id: "packaging-intact",   label: "Packaging intact & sealed",    required: true  },
    { id: "presentation-ok",    label: "Presentation acceptable",      required: true  },
    { id: "temp-at-pack",       label: "Temp-at-pack logged",          required: false },
  ],
};

/** FDA Food Code cold-holding limit (°F). */
export const COLD_HOLDING_MAX_F = 41;

export interface CheckResponse {
  itemId: string;
  ok: boolean;
  note?: string;
}

export interface CheckVerdict {
  passed: boolean;
  /** IDs of required items that are missing or marked not-ok. */
  failedRequired: string[];
  /** Human-readable failure reasons (includes temp overages). */
  failedReasons: string[];
}

/** Return the checklist items for a given kind. */
export function checklistFor(kind: SafetyCheckKind): ChecklistItem[] {
  return CHECKLISTS[kind];
}

/**
 * Evaluate a submitted checklist against its kind's required items and,
 * for FOOD_SAFETY checks, an optional cold-holding temperature.
 *
 * A check passes when:
 *   - every required item has a response with ok === true, AND
 *   - the temperature (if provided) does not exceed COLD_HOLDING_MAX_F.
 *
 * A missing response for a required item is treated as a failure.
 * Optional items never contribute to failedRequired (but they may be noted).
 * A missing temperature does NOT by itself fail — the "cold-holding-logged"
 * required checklist item is what enforces that the operator logged it.
 */
export function evaluateCheck(
  kind: SafetyCheckKind,
  responses: CheckResponse[],
  temperatureF?: number,
): CheckVerdict {
  const items = CHECKLISTS[kind];
  const responseMap = new Map<string, CheckResponse>(
    responses.map((r) => [r.itemId, r]),
  );

  const failedRequired: string[] = [];
  const failedReasons: string[] = [];

  for (const item of items) {
    if (!item.required) continue;
    const response = responseMap.get(item.id);
    if (!response || !response.ok) {
      failedRequired.push(item.id);
      failedReasons.push(`Required item not satisfied: "${item.label}"`);
    }
  }

  // Temperature over-limit is always a failure for FOOD_SAFETY checks.
  let tempOverLimit = false;
  if (kind === "FOOD_SAFETY" && temperatureF !== undefined) {
    if (temperatureF > COLD_HOLDING_MAX_F) {
      tempOverLimit = true;
      failedReasons.push(
        `Cold-holding temp ${temperatureF}°F exceeds ${COLD_HOLDING_MAX_F}°F`,
      );
    }
  }

  return {
    passed: failedRequired.length === 0 && !tempOverLimit,
    failedRequired,
    failedReasons,
  };
}
