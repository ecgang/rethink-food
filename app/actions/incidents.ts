"use server";

import { put } from "@vercel/blob";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentRole, getOperatorIdentity } from "@/lib/current-role";
import { can } from "@/lib/roles";

export type IncidentResult = { ok: true; id: string } | { ok: false; error: string };

const MAX_PHOTO_BYTES = 2_000_000; // 2 MB — downscaled photos are ~150–300 KB

const kindSchema = z.enum(["FOOD_SAFETY", "QUALITY", "DELIVERY", "EQUIPMENT", "OTHER"]);
const severitySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const idSchema = z.string().min(1).max(64);

/** Validate an optional FK id from FormData: "" / missing → null; present → bounded. */
function optionalId(raw: FormDataEntryValue | null): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw instanceof File) return { ok: true, value: null };
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  return idSchema.safeParse(trimmed).success ? { ok: true, value: trimmed } : { ok: false };
}

/** Field operators and execs may report and resolve incidents; Finance is read-only. */
async function requireOperator(): Promise<string | null> {
  const role = await getCurrentRole();
  if (!can(role, "operate:field")) return null;
  return getOperatorIdentity();
}

function refresh() {
  revalidatePath("/field/incidents");
  revalidatePath("/");
}

/**
 * Report a new incident from the field. Optionally attaches a proof photo
 * uploaded to Vercel Blob when configured; the report is saved either way.
 */
export async function reportIncident(formData: FormData): Promise<IncidentResult> {
  const operator = await requireOperator();
  if (!operator) return { ok: false, error: "Your role can't report incidents." };

  const kindParsed = kindSchema.safeParse(formData.get("kind"));
  if (!kindParsed.success) return { ok: false, error: "Invalid incident kind." };

  const severityParsed = severitySchema.safeParse(formData.get("severity"));
  if (!severityParsed.success) return { ok: false, error: "Invalid severity." };

  const titleRaw = formData.get("title");
  const titleParsed = z.string().min(1).max(200).safeParse(titleRaw);
  if (!titleParsed.success) return { ok: false, error: "Title must be 1–200 characters." };

  const descRaw = formData.get("description");
  const descParsed = z.string().min(1).max(2000).safeParse(descRaw);
  if (!descParsed.success) return { ok: false, error: "Description must be 1–2000 characters." };

  const kitchenParsed = optionalId(formData.get("kitchenId"));
  if (!kitchenParsed.ok) return { ok: false, error: "Invalid kitchen reference." };
  const mealParsed = optionalId(formData.get("mealId"));
  if (!mealParsed.ok) return { ok: false, error: "Invalid meal reference." };
  const kitchenId = kitchenParsed.value;
  const mealId = mealParsed.value;

  let photoUrl: string | null = null;
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
        const filename = `${crypto.randomUUID()}.jpg`;
        const blob = await put(`incidents/${filename}`, photo, {
          access: "public",
          contentType: photo.type,
          addRandomSuffix: true,
        });
        photoUrl = blob.url;
      } catch {
        return { ok: false, error: "Photo upload failed. Try again." };
      }
    }
    // else: no Blob store configured — proceed without the photo.
  }

  let incident;
  try {
    incident = await prisma.incident.create({
      data: {
        kind: kindParsed.data,
        severity: severityParsed.data,
        status: "OPEN",
        title: titleParsed.data,
        description: descParsed.data,
        kitchenId,
        mealId,
        photoUrl,
        reportedBy: operator,
      },
    });
  } catch {
    // Most likely a foreign-key violation: the kitchen/meal id doesn't exist.
    return { ok: false, error: "Couldn't save — the linked kitchen or meal wasn't found." };
  }

  refresh();
  return { ok: true, id: incident.id };
}

/**
 * Resolve an open or acknowledged incident, optionally recording a resolution
 * note. Idempotent — a no-op if the incident is already resolved.
 */
export async function resolveIncident(formData: FormData): Promise<IncidentResult> {
  const operator = await requireOperator();
  if (!operator) return { ok: false, error: "Your role can't resolve incidents." };

  const incidentId = formData.get("incidentId");
  const idParsed = z.string().min(1).max(64).safeParse(incidentId);
  if (!idParsed.success) return { ok: false, error: "Missing incident ID." };

  const noteRaw = formData.get("resolutionNote");
  const noteParsed = z.string().max(2000).optional().safeParse(
    noteRaw instanceof File || noteRaw === null ? undefined : noteRaw,
  );
  if (!noteParsed.success) return { ok: false, error: "Resolution note must be under 2000 characters." };

  const res = await prisma.incident.updateMany({
    where: { id: idParsed.data, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolvedBy: operator,
      resolutionNote: noteParsed.data || null,
    },
  });

  if (res.count === 0) return { ok: false, error: "Incident isn't open." };

  refresh();
  return { ok: true, id: idParsed.data };
}
