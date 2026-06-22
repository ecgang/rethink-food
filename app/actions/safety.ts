"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentRole, getOperatorIdentity } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { evaluateCheck, type CheckResponse } from "@/lib/safety";

export type SafetyResult =
  | { ok: true; passed: boolean }
  | { ok: false; error: string };

/** Field operators and execs may submit safety checks; Finance is read-only. */
async function requireOperator(): Promise<string | null> {
  const role = await getCurrentRole();
  if (!can(role, "operate:field")) return null;
  return getOperatorIdentity();
}

const kindSchema = z.enum(["FOOD_SAFETY", "QUALITY"]);

const checkResponseSchema = z.object({
  itemId: z.string().min(1).max(64),
  ok: z.boolean(),
  note: z.string().max(500).optional(),
});

const responsesSchema = z.array(checkResponseSchema).max(20);

export async function submitSafetyCheck(
  formData: FormData,
): Promise<SafetyResult> {
  const operator = await requireOperator();
  if (!operator) {
    return { ok: false, error: "Your role can't submit safety checks." };
  }

  // --- validate kind ---
  const kindParsed = kindSchema.safeParse(formData.get("kind"));
  if (!kindParsed.success) {
    return { ok: false, error: "Invalid check kind." };
  }
  const kind = kindParsed.data;

  // --- validate responses ---
  const rawResponses = formData.get("responses");
  if (typeof rawResponses !== "string") {
    return { ok: false, error: "Responses are required." };
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawResponses);
  } catch {
    return { ok: false, error: "Malformed responses JSON." };
  }
  const responsesParsed = responsesSchema.safeParse(parsedJson);
  if (!responsesParsed.success) {
    return { ok: false, error: "Invalid responses format." };
  }
  const responses: CheckResponse[] = responsesParsed.data;

  // --- optional fields ---
  const rawTemp = formData.get("temperatureF");
  let temperatureF: number | undefined;
  if (typeof rawTemp === "string" && rawTemp.trim() !== "") {
    const n = Number(rawTemp);
    if (Number.isFinite(n)) {
      temperatureF = n;
    } else {
      return { ok: false, error: "Temperature must be a number." };
    }
  }

  const rawKitchenId = formData.get("kitchenId");
  const kitchenId =
    typeof rawKitchenId === "string" && rawKitchenId.trim() !== ""
      ? rawKitchenId.trim()
      : undefined;

  const rawMealDate = formData.get("mealDate");
  let mealDate: Date | undefined;
  if (typeof rawMealDate === "string" && rawMealDate.trim() !== "") {
    const d = new Date(rawMealDate);
    if (isNaN(d.getTime())) {
      return { ok: false, error: "Invalid meal date." };
    }
    mealDate = d;
  }

  // --- compute verdict ---
  const verdict = evaluateCheck(kind, responses, temperatureF);

  // --- persist ---
  await prisma.safetyCheck.create({
    data: {
      kind,
      kitchenId: kitchenId ?? null,
      mealDate: mealDate ?? null,
      responses: responses as unknown as Prisma.InputJsonValue,
      passed: verdict.passed,
      temperatureF: temperatureF ?? null,
      checkedBy: operator,
    },
  });

  revalidatePath("/field/safety");
  revalidatePath("/");

  return { ok: true, passed: verdict.passed };
}
