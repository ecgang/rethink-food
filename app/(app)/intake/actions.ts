"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentRole, getOperatorIdentity } from "@/lib/current-role";
import { can } from "@/lib/roles";
import {
  parseIntakeEmail,
  screenIntakeInput,
  type IntakeParseResult,
  type IntakeFields,
  type ConfidenceFlags,
} from "@/lib/intake";

const EMPTY_FIELDS: IntakeFields = {
  cbo: null, quantity: null, deliveryDate: null, recurrence: null,
  dietaryConstraints: [], location: null, notes: null,
};

/** Step 1: parse raw text into structured fields. Does NOT touch the database. */
export async function parseAction(raw: string): Promise<IntakeParseResult> {
  // Cost guard: parsing invokes the live model. Require the intake capability so
  // this isn't an open, unauthenticated LLM endpoint. NOTE: demo roles default to
  // EXEC, so production additionally needs durable per-client rate limiting (see
  // the TODO in lib/intake.ts) — the capability check is defense-in-depth, the
  // MAX_INTAKE_CHARS cap bounds per-call cost.
  if (!can(await getCurrentRole(), "approve:intake")) {
    return { fields: EMPTY_FIELDS, confidence: {}, modelUsed: "unauthorized" };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { fields: EMPTY_FIELDS, confidence: {}, modelUsed: "none" };
  }

  // Input safety screen — runs before the model, costs nothing.
  // Flagged input is routed to human review (modelUsed: "flagged") rather
  // than sent to the LLM. The production upgrade is a moderation/Model-Armor
  // pass that catches subtler violations (see screenIntakeInput in lib/intake.ts).
  const screen = screenIntakeInput(trimmed);
  if (!screen.ok) {
    return {
      fields: { ...EMPTY_FIELDS, notes: `Flagged for review: ${screen.reason}` },
      confidence: { notes: "low" },
      modelUsed: "flagged",
    };
  }

  return parseIntakeEmail(trimmed);
}

interface DecisionPayload {
  raw: string;
  fields: IntakeFields;
  confidence: ConfidenceFlags;
  modelUsed: string;
}

/** Enforce the approve:intake capability server-side (not just in the UI). */
async function assertCanApprove(): Promise<string> {
  const role = await getCurrentRole();
  if (!can(role, "approve:intake")) {
    throw new Error("Your role does not have permission to decide intake requests.");
  }
  return getOperatorIdentity();
}

/** Step 2a: operator approves — writes the audit row and links the CBO. */
export async function approveAction(payload: DecisionPayload): Promise<void> {
  const approvedBy = await assertCanApprove();
  const cbo = payload.fields.cbo
    ? await prisma.cbo.findFirst({
        where: { name: { contains: payload.fields.cbo, mode: "insensitive" } },
        select: { id: true },
      })
    : null;

  await prisma.intakeRequest.create({
    data: {
      rawInput: payload.raw,
      extractedFields: payload.fields,
      confidenceFlags: payload.confidence,
      modelUsed: payload.modelUsed,
      status: "APPROVED",
      approvedBy,
      approvedAt: new Date(),
      cboId: cbo?.id ?? null,
    },
  });
  revalidatePath("/intake");
}

/** Step 2b: operator rejects — still recorded for the audit trail. */
export async function rejectAction(payload: DecisionPayload): Promise<void> {
  const approvedBy = await assertCanApprove();
  await prisma.intakeRequest.create({
    data: {
      rawInput: payload.raw,
      extractedFields: payload.fields,
      confidenceFlags: payload.confidence,
      modelUsed: payload.modelUsed,
      status: "REJECTED",
      approvedBy,
      approvedAt: new Date(),
    },
  });
  revalidatePath("/intake");
}

/**
 * PII deletion path — right-to-erasure for a stored intake request.
 * Gated to the EXEC role only. Deletes rawInput + extractedFields; any
 * scheduled Meals linked via intakeRequestId survive with a NULL back-link
 * (ON DELETE SET NULL on the FK — intentional, documented in DECISIONS.md).
 */
export async function deleteIntakeRequest(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  if ((await getCurrentRole()) !== "EXEC") {
    return { ok: false, error: "Only the EXEC role may delete intake records." };
  }
  try {
    await prisma.intakeRequest.delete({ where: { id } });
    revalidatePath("/intake");
    return { ok: true };
  } catch {
    return { ok: false, error: "Deletion failed — record may not exist." };
  }
}
