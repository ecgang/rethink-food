"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentRole, getOperatorIdentity } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { prisma } from "@/lib/db";
import { createScheduledMeals } from "@/lib/scheduling";
import { log } from "@/lib/log";

// Discriminated result — never throws to the client.
export type FulfillResult =
  | { ok: true; created: number }
  | { ok: false; error: string };

// Three days from now (default mealDate when caller omits it).
function defaultMealDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d;
}

const fulfillSchema = z.object({
  requestId: z.string().min(1).max(64),
  producerType: z.enum(["kitchen", "restaurant"]),
  producerId: z.string().min(1).max(64),
  contractId: z.string().min(1).max(64),
  quantity: z.coerce.number().int().min(1).optional(),
  mealDate: z.coerce.date().optional(),
});

/**
 * Fulfill an APPROVED IntakeRequest by scheduling meals.
 * Gated by the `match:supply` capability (EXEC + OPS only; FINANCE is blocked).
 *
 * marketId and cboId are resolved server-side from the request row — never
 * trusted from the form.
 */
export async function fulfillIntake(formData: FormData): Promise<FulfillResult> {
  // ── 1. RBAC gate — no DB writes if role lacks the capability ────────────
  const role = await getCurrentRole();
  if (!can(role, "match:supply")) {
    return { ok: false, error: "Your role cannot match supply." };
  }

  // ── 2. Input validation ─────────────────────────────────────────────────
  const raw = {
    requestId: formData.get("requestId"),
    producerType: formData.get("producerType"),
    producerId: formData.get("producerId"),
    contractId: formData.get("contractId"),
    quantity: formData.get("quantity") ?? undefined,
    mealDate: formData.get("mealDate") ?? undefined,
  };

  const parsed = fulfillSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "Invalid input." };
  }

  const { requestId, producerType, producerId, contractId } = parsed.data;
  const formQuantity = parsed.data.quantity;
  const formMealDate = parsed.data.mealDate;

  // ── 3. Load + validate the request ──────────────────────────────────────
  const request = await prisma.intakeRequest.findUnique({
    where: { id: requestId },
    include: { cbo: { select: { id: true, marketId: true } } },
  });

  if (!request) {
    return { ok: false, error: "Intake request not found." };
  }
  if (request.status !== "APPROVED") {
    return {
      ok: false,
      error: `Request cannot be fulfilled: status is ${request.status}.`,
    };
  }
  if (!request.cboId || !request.cbo) {
    return { ok: false, error: "Request has no resolved CBO — cannot schedule." };
  }

  // ── 4. Derive server-side values (never trusted from form) ───────────────
  const marketId = request.cbo.marketId;
  const cboId = request.cboId;

  // Narrow extractedFields safely — no `any`.
  const ef: unknown = request.extractedFields;

  // Resolve quantity: form value → extractedFields.quantity → error
  let quantity: number;
  if (formQuantity !== undefined) {
    quantity = formQuantity;
  } else {
    const efQuantity =
      ef !== null &&
      typeof ef === "object" &&
      "quantity" in ef &&
      typeof (ef as Record<string, unknown>).quantity === "number"
        ? ((ef as Record<string, unknown>).quantity as number)
        : null;
    if (efQuantity === null || efQuantity < 1) {
      return { ok: false, error: "Quantity not specified and none found in extracted fields." };
    }
    quantity = efQuantity;
  }

  // Resolve mealDate: form value → extractedFields.deliveryDate (ISO) → now+3d
  let mealDate: Date;
  if (formMealDate !== undefined) {
    mealDate = formMealDate;
  } else {
    const efDeliveryDate =
      ef !== null &&
      typeof ef === "object" &&
      "deliveryDate" in ef &&
      typeof (ef as Record<string, unknown>).deliveryDate === "string"
        ? ((ef as Record<string, unknown>).deliveryDate as string)
        : null;
    mealDate = efDeliveryDate ? new Date(efDeliveryDate) : defaultMealDate();
  }

  // ── 5. Resolve operator identity before the transaction ─────────────────
  const fulfilledBy = await getOperatorIdentity();

  // ── 6. Atomically create meals + mark request FULFILLED ──────────────────
  // Both writes share one transaction: if the process dies between them, neither
  // commits — no orphan meals with the request stuck at APPROVED.
  let result: Awaited<ReturnType<typeof createScheduledMeals>>;
  try {
    result = await prisma.$transaction(async (tx) => {
      const r = await createScheduledMeals(
        {
          marketId,
          producerType,
          producerId,
          contractId,
          cboId,
          quantity,
          mealDate,
          intakeRequestId: requestId,
        },
        tx,
      );
      // Validation failure → return the rejection; nothing was written.
      if (!r.ok) return r;

      await tx.intakeRequest.update({
        where: { id: requestId },
        data: {
          status: "FULFILLED",
          fulfilledAt: new Date(),
          fulfilledBy,
        },
      });

      return r;
    });
  } catch (err) {
    log.error("fulfill_failed", err, { requestId });
    return { ok: false, error: "Could not schedule meals — please retry." };
  }

  if (!result.ok) {
    return result;
  }

  // ── 7. Revalidate affected pages ─────────────────────────────────────────
  revalidatePath("/intake");
  revalidatePath("/");
  revalidatePath("/meals");

  return result;
}
