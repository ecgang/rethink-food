// Missing-information detector for pending intake requests (feature ③).
//
// Pure and deterministic — NO model call, NO lib/db import. It takes already-
// fetched PENDING IntakeRequest rows and flags the ones whose key fields are
// absent or low-confidence, so an operator (or the ⑤ comms agent) can follow up.
// This is the bridge from "anomaly detection" (③) to "human-reviewed follow-up"
// (⑤): the fields flagged here are exactly what a clarification email should ask for.

export interface MissingInfoItem {
  intakeId: string;
  createdAt: Date;
  cboName: string | null;
  /** Human-readable labels of the fields that need clarification. */
  missingFields: string[];
}

/** Pending intake row shape (JSON columns arrive untyped from Prisma). */
export interface PendingIntake {
  id: string;
  extractedFields: unknown;
  confidenceFlags: unknown;
  createdAt: Date;
}

// The fields an operator needs before a request can be scheduled into meals.
const REQUIRED_FIELDS: { key: string; label: string }[] = [
  { key: "cbo", label: "CBO name" },
  { key: "quantity", label: "quantity" },
  { key: "deliveryDate", label: "delivery date" },
];

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function isAbsent(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * Flag pending requests missing a required field (absent value OR low confidence).
 * Returns one item per request that needs follow-up, newest first preserved.
 */
export function detectMissingIntakeInfo(requests: PendingIntake[]): MissingInfoItem[] {
  const out: MissingInfoItem[] = [];
  for (const req of requests) {
    const fields = asRecord(req.extractedFields);
    const confidence = asRecord(req.confidenceFlags);
    const missing: string[] = [];
    for (const { key, label } of REQUIRED_FIELDS) {
      if (isAbsent(fields[key]) || confidence[key] === "low") {
        missing.push(label);
      }
    }
    if (missing.length > 0) {
      out.push({
        intakeId: req.id,
        createdAt: req.createdAt,
        cboName: typeof fields.cbo === "string" ? fields.cbo : null,
        missingFields: missing,
      });
    }
  }
  return out;
}
