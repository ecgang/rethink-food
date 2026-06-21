"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentRole, getOperatorIdentity } from "@/lib/current-role";
import { can } from "@/lib/roles";
import {
  parseIntakeEmail,
  type IntakeParseResult,
  type IntakeFields,
  type ConfidenceFlags,
} from "@/lib/intake";

/** Step 1: parse raw text into structured fields. Does NOT touch the database. */
export async function parseAction(raw: string): Promise<IntakeParseResult> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      fields: {
        cbo: null, quantity: null, deliveryDate: null, recurrence: null,
        dietaryConstraints: [], location: null, notes: null,
      },
      confidence: {},
      modelUsed: "none",
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
