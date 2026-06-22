import { prisma } from "@/lib/db";
import { eligibleProducers, getMatchOptions } from "@/lib/partners";
import type { EligibleProducer, MatchOptionsContract } from "@/lib/partners";

// ---------------------------------------------------------------------------
// createScheduledMeals
// ---------------------------------------------------------------------------

export interface ScheduleInput {
  marketId: string;
  producerType: "kitchen" | "restaurant";
  producerId: string;
  contractId: string;
  cboId: string;
  quantity: number;
  mealDate: Date;
  intakeRequestId?: string;
}

export type ScheduleResult =
  | { ok: true; created: number }
  | { ok: false; error: string };

/**
 * Validated meal-create core: checks producer capacity, contract, CBO, then
 * bulk-inserts `quantity` PLANNED Meal rows.
 *
 * Does NOT perform RBAC, zod validation, or cache revalidation — those belong
 * with the caller (`matchSupply`, `fulfillIntake`, etc.).
 */
export async function createScheduledMeals(
  input: ScheduleInput,
): Promise<ScheduleResult> {
  const {
    marketId,
    producerType,
    producerId,
    contractId,
    cboId,
    quantity,
    mealDate,
    intakeRequestId,
  } = input;

  // ── 1. Validate producer exists in market and has sufficient spare ────────
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

  // ── 2. Resolve programId from contract + validate CBO in market ───────────
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

  // ── 3. Create `quantity` PLANNED Meal rows ────────────────────────────────
  const now = new Date();

  const meals = Array.from({ length: quantity }, () => ({
    programId,
    contractId,
    marketId,
    producerType:
      producerType === "kitchen" ? ("KITCHEN" as const) : ("RESTAURANT" as const),
    kitchenId: producerType === "kitchen" ? producerId : null,
    restaurantPartnerId: producerType === "restaurant" ? producerId : null,
    cboId,
    status: "PLANNED" as const,
    mealDate,
    plannedAt: now,
    intakeRequestId: intakeRequestId ?? null,
    // memberId intentionally omitted (MTM-only, set at delivery)
    // cost line items added at production time
  }));

  await prisma.meal.createMany({ data: meals });

  return { ok: true, created: quantity };
}

// ---------------------------------------------------------------------------
// getApprovedRequests
// ---------------------------------------------------------------------------

/** Fields narrowed from the `extractedFields Json` column (see lib/intake.ts). */
interface NarrowedExtractedFields {
  quantity: number | null;
  deliveryDate: string | null; // ISO YYYY-MM-DD or null
}

/** Suggestion computed from in-market eligible producers + active contracts. */
export interface RequestSuggestion {
  producer: EligibleProducer | null;
  contract: MatchOptionsContract | null;
}

export interface ApprovedRequest {
  id: string;
  rawInput: string;
  createdAt: Date;
  approvedAt: Date | null;
  approvedBy: string | null;
  cboId: string;
  cboName: string;
  marketId: string;
  /** Narrowed from extractedFields.quantity */
  quantity: number | null;
  /** Narrowed from extractedFields.deliveryDate (ISO string) */
  deliveryDate: string | null;
  suggestion: RequestSuggestion;
}

/**
 * Returns APPROVED-and-not-yet-FULFILLED IntakeRequests that have a cboId,
 * each joined to its CBO + market. Attaches a suggested producer (in-market,
 * most spare) and the first active contract for that market.
 */
export async function getApprovedRequests(): Promise<ApprovedRequest[]> {
  const rows = await prisma.intakeRequest.findMany({
    where: {
      status: "APPROVED",
      fulfilledAt: null,
      cboId: { not: null },
    },
    orderBy: { approvedAt: "asc" },
    select: {
      id: true,
      rawInput: true,
      extractedFields: true,
      createdAt: true,
      approvedAt: true,
      approvedBy: true,
      cboId: true,
      cbo: {
        select: {
          name: true,
          market: {
            select: { id: true },
          },
        },
      },
    },
  });

  // For each unique market, fetch eligible producers + match options in parallel.
  const marketIds = [...new Set(rows.map((r) => r.cbo!.market.id))];
  const [producersByMarket, optionsByMarket] = await Promise.all([
    Promise.all(marketIds.map((id) => eligibleProducers(id).then((p) => ({ id, p })))),
    Promise.all(marketIds.map((id) => getMatchOptions(id).then((o) => ({ id, o })))),
  ]);

  const producersMap = new Map(
    producersByMarket.map(({ id, p }) => [id, p]),
  );
  const optionsMap = new Map(
    optionsByMarket.map(({ id, o }) => [id, o]),
  );

  return rows.map((row) => {
    const marketId = row.cbo!.market.id;
    const cboId = row.cboId!;

    // Narrow extractedFields safely — no `any`.
    const ef: unknown = row.extractedFields;
    const narrowed: NarrowedExtractedFields = {
      quantity:
        ef !== null &&
        typeof ef === "object" &&
        "quantity" in ef &&
        typeof (ef as Record<string, unknown>).quantity === "number"
          ? ((ef as Record<string, unknown>).quantity as number)
          : null,
      deliveryDate:
        ef !== null &&
        typeof ef === "object" &&
        "deliveryDate" in ef &&
        typeof (ef as Record<string, unknown>).deliveryDate === "string"
          ? ((ef as Record<string, unknown>).deliveryDate as string)
          : null,
    };

    // Suggestion: the producer with the most spare capacity (eligibleProducers
    // does not sort, so pick the max here), and the first active contract.
    const producers = producersMap.get(marketId) ?? [];
    const options = optionsMap.get(marketId);

    const bestProducer = producers.reduce<(typeof producers)[number] | null>(
      (best, p) => (best === null || p.spare > best.spare ? p : best),
      null,
    );

    const suggestion: RequestSuggestion = {
      producer: bestProducer,
      contract: options?.contracts[0] ?? null,
    };

    return {
      id: row.id,
      rawInput: row.rawInput,
      createdAt: row.createdAt,
      approvedAt: row.approvedAt,
      approvedBy: row.approvedBy,
      cboId,
      cboName: row.cbo!.name,
      marketId,
      quantity: narrowed.quantity,
      deliveryDate: narrowed.deliveryDate,
      suggestion,
    };
  });
}
