"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentRole } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { eligibleProducers, getMatchOptions } from "@/lib/partners";

// Discriminated result — never throws to the client.
export type MatchResult =
  | { ok: true; created: number }
  | { ok: false; error: string };

// Three days from now (default mealDate when caller omits it).
function defaultMealDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d;
}

const matchSchema = z.object({
  marketId: z.string().min(1).max(64),
  producerType: z.enum(["kitchen", "restaurant"]),
  producerId: z.string().min(1).max(64),
  contractId: z.string().min(1).max(64),
  cboId: z.string().min(1).max(64),
  quantity: z.coerce.number().int().min(1),
  slug: z.string().min(1).max(128),
  mealDate: z.coerce.date().optional(),
});

/**
 * Plan `quantity` meals for a market by wiring a producer, contract, and CBO.
 * Gated by the `match:supply` capability (EXEC + OPS only; FINANCE is read-only).
 */
export async function matchSupply(formData: FormData): Promise<MatchResult> {
  // ── 1. RBAC gate — no DB writes if role lacks the capability ────────────
  const role = await getCurrentRole();
  if (!can(role, "match:supply")) {
    return { ok: false, error: "Your role cannot match supply." };
  }

  // ── 2. Input validation ─────────────────────────────────────────────────
  const raw = {
    marketId: formData.get("marketId"),
    producerType: formData.get("producerType"),
    producerId: formData.get("producerId"),
    contractId: formData.get("contractId"),
    cboId: formData.get("cboId"),
    quantity: formData.get("quantity"),
    slug: formData.get("slug"),
    mealDate: formData.get("mealDate") ?? undefined,
  };

  const parsed = matchSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "Invalid input." };
  }

  const {
    marketId,
    producerType,
    producerId,
    contractId,
    cboId,
    quantity,
    slug,
    mealDate = defaultMealDate(),
  } = parsed.data;

  // ── 3. Validate producer exists in market and has sufficient spare ───────
  const producers = await eligibleProducers(marketId);
  const producer = producers.find(
    (p) => p.id === producerId && p.type === producerType,
  );

  if (!producer) {
    return {
      ok: false,
      error: "Producer not found in this market or has no spare capacity.",
    };
  }
  if (quantity > producer.spare) {
    return {
      ok: false,
      error: `Quantity ${quantity} exceeds spare capacity of ${producer.spare}.`,
    };
  }

  // ── 4. Resolve programId from contract + validate CBO in market ──────────
  const options = await getMatchOptions(marketId);

  const contract = options.contracts.find((c) => c.id === contractId);
  if (!contract) {
    return { ok: false, error: "Contract not found for this market." };
  }
  const { programId } = contract;

  const cboInMarket = options.cbos.find((c) => c.id === cboId);
  if (!cboInMarket) {
    return { ok: false, error: "CBO does not belong to this market." };
  }

  // ── 5. Create `quantity` PLANNED Meal rows ───────────────────────────────
  const now = new Date();

  const meals = Array.from({ length: quantity }, () => ({
    programId,
    contractId,
    marketId,
    producerType: producerType === "kitchen" ? ("KITCHEN" as const) : ("RESTAURANT" as const),
    kitchenId: producerType === "kitchen" ? producerId : null,
    restaurantPartnerId: producerType === "restaurant" ? producerId : null,
    cboId,
    status: "PLANNED" as const,
    mealDate,
    plannedAt: now,
    // memberId intentionally omitted (MTM-only, set at delivery)
    // cost line items added at production time
  }));

  await prisma.meal.createMany({ data: meals });

  // ── 6. Revalidate affected pages ─────────────────────────────────────────
  revalidatePath(`/markets/${slug}`);
  revalidatePath("/");
  revalidatePath("/meals");

  return { ok: true, created: quantity };
}
