"use server";

import { put } from "@vercel/blob";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentRole, getOperatorIdentity } from "@/lib/current-role";
import { can } from "@/lib/roles";

// Result the field client components render against. Never throws to the client;
// returns a discriminated result so the UI can show a clear retry state offline.
export type FieldResult =
  | { ok: true; photoUrl: string | null }
  | { ok: false; error: string };

const mealIdSchema = z.string().min(1).max(64);

const MAX_PHOTO_BYTES = 2_000_000; // 2 MB — downscaled photos are ~150–300 KB

/** Field operators (OPS) and execs may advance the lifecycle; Finance is read-only. */
async function requireOperator(): Promise<string | null> {
  const role = await getCurrentRole();
  if (!can(role, "operate:field")) return null;
  return getOperatorIdentity();
}

function refresh() {
  // the field queue shrinks AND the Command Center "act on today" feed clears,
  // because that feed is recomputed from live meal state on every render.
  revalidatePath("/field");
  revalidatePath("/");
}

/**
 * Mark a PRODUCED meal as DELIVERED, optionally attaching a delivery-proof photo
 * captured in the field. The photo is uploaded to Vercel Blob when configured;
 * if Blob isn't wired up (e.g. local dev without a token) the delivery still
 * records — proof is optional, the lifecycle transition is not.
 */
export async function markDelivered(formData: FormData): Promise<FieldResult> {
  const operator = await requireOperator();
  if (!operator) return { ok: false, error: "Your role can't update deliveries." };

  const parsed = mealIdSchema.safeParse(formData.get("mealId"));
  if (!parsed.success) return { ok: false, error: "Missing meal." };
  const mealId = parsed.data;

  let deliveryPhotoUrl: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (!photo.type.startsWith("image/")) {
      return { ok: false, error: "Attach an image file." };
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      return { ok: false, error: "Photo must be under 2 MB." };
    }
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const blob = await put(`deliveries/${mealId}.jpg`, photo, {
          access: "public",
          contentType: photo.type,
          addRandomSuffix: true,
        });
        deliveryPhotoUrl = blob.url;
      } catch {
        return { ok: false, error: "Photo upload failed. Try again." };
      }
    }
    // else: no Blob store configured — proceed without the photo.
  }

  // Guard the transition: only a PRODUCED meal can be delivered (idempotent).
  const res = await prisma.meal.updateMany({
    where: { id: mealId, status: "PRODUCED" },
    data: {
      status: "DELIVERED",
      deliveredAt: new Date(),
      deliveredBy: operator,
      ...(deliveryPhotoUrl ? { deliveryPhotoUrl } : {}),
    },
  });
  if (res.count === 0) return { ok: false, error: "Meal isn't awaiting delivery." };

  refresh();
  return { ok: true, photoUrl: deliveryPhotoUrl };
}

/** Mark a DELIVERED meal as VERIFIED (closes the loop, clears its exception). */
export async function markVerified(mealId: string): Promise<FieldResult> {
  const operator = await requireOperator();
  if (!operator) return { ok: false, error: "Your role can't verify meals." };

  const parsed = mealIdSchema.safeParse(mealId);
  if (!parsed.success) return { ok: false, error: "Missing meal." };

  const res = await prisma.meal.updateMany({
    where: { id: parsed.data, status: "DELIVERED" },
    data: { status: "VERIFIED", verifiedAt: new Date(), verifiedBy: operator },
  });
  if (res.count === 0) return { ok: false, error: "Meal isn't awaiting verification." };

  refresh();
  return { ok: true, photoUrl: null };
}
