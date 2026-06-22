"use server";

import { revalidatePath } from "next/cache";
import { getCurrentRole, getOperatorIdentity } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { generateDraftFor, reviewDraft, type DraftDTO } from "@/lib/comms";
import type { DraftCommKind } from "@prisma/client";

export type DraftResult = { ok: true; draft: DraftDTO } | { ok: false; error: string };

/** Generate (and persist as DRAFT) a follow-up for an entity. Capability-gated; never sends. */
export async function generateDraftAction(input: {
  kind: DraftCommKind;
  entityId: string;
  audience?: "board" | "funder";
}): Promise<DraftResult> {
  if (!can(await getCurrentRole(), "draft:comms")) {
    return { ok: false, error: "Your role does not have permission to draft communications." };
  }
  try {
    const draft = await generateDraftFor(input.kind, input.entityId, { audience: input.audience });
    revalidatePath("/drafts");
    return { ok: true, draft };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not generate the draft." };
  }
}

/** Approve or discard a draft (optionally saving human edits). Records the reviewer for the audit trail. */
export async function reviewDraftAction(input: {
  id: string;
  decision: "APPROVED" | "DISCARDED";
  subject?: string;
  body?: string;
}): Promise<DraftResult> {
  if (!can(await getCurrentRole(), "draft:comms")) {
    return { ok: false, error: "Your role does not have permission to review communications." };
  }
  try {
    const reviewedBy = await getOperatorIdentity();
    const draft = await reviewDraft(input.id, input.decision, reviewedBy, {
      subject: input.subject,
      body: input.body,
    });
    revalidatePath("/drafts");
    return { ok: true, draft };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the draft." };
  }
}
