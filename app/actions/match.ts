"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentRole } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { createScheduledMeals } from "@/lib/scheduling";
import { log } from "@/lib/log";

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

  // ── 3–5. Delegate validated meal creation to the shared scheduling core ──
  let result: Awaited<ReturnType<typeof createScheduledMeals>>;
  try {
    result = await createScheduledMeals({
      marketId,
      producerType,
      producerId,
      contractId,
      cboId,
      quantity,
      mealDate,
    });
  } catch (err) {
    log.error("match_failed", err, { marketId });
    return { ok: false, error: "Could not schedule meals — please retry." };
  }

  if (!result.ok) {
    return result;
  }

  // ── 6. Revalidate affected pages ─────────────────────────────────────────
  revalidatePath(`/markets/${slug}`);
  revalidatePath("/");
  revalidatePath("/meals");

  return result;
}
