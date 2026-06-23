// Comms agent orchestrator (⑤) — the DB-touching layer that keeps lib/ai/comms
// pure. It fetches the entity context for a draft, calls the matching generator,
// and persists/reviews DraftComm rows. Nothing is ever sent: the lifecycle is
// DRAFT → APPROVED | DISCARDED, all human-reviewed.

import { prisma } from "@/lib/db";
import { buildWeeklyReportPayload } from "@/lib/reports";
import { detectMissingIntakeInfo } from "@/lib/ai/missing-info";
import { KIND_LABELS } from "@/lib/incidents";
import {
  draftIntakeClarification,
  draftDeliveryNudge,
  draftReconciliationFlag,
  draftReportNarrative,
  draftIncidentNotice,
  type DraftContent,
} from "@/lib/ai/comms";
import type { DraftCommKind } from "@prisma/client";

/** Serializable view of a draft for the client. */
export interface DraftDTO {
  id: string;
  kind: DraftCommKind;
  relatedEntityType: string;
  relatedEntityId: string;
  subject: string;
  body: string;
  status: "DRAFT" | "APPROVED" | "DISCARDED";
  modelUsed: string;
  generatedAt: string;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Generate a draft for an entity and persist it as a DRAFT row. `audience` only
 * applies to REPORT_NARRATIVE. Throws if the entity can't be found.
 */
export async function generateDraftFor(
  kind: DraftCommKind,
  entityId: string,
  opts: { audience?: "board" | "funder"; now?: Date } = {},
): Promise<DraftDTO> {
  const now = opts.now ?? new Date();
  let content: DraftContent;
  let relatedEntityType: string;

  switch (kind) {
    case "INTAKE_CLARIFICATION": {
      const row = await prisma.intakeRequest.findUnique({
        where: { id: entityId },
        select: { id: true, extractedFields: true, confidenceFlags: true, createdAt: true },
      });
      if (!row) throw new Error("Intake request not found.");
      const missing = detectMissingIntakeInfo([row])[0];
      content = await draftIntakeClarification({
        cboName: missing?.cboName ?? null,
        missingFields: missing?.missingFields ?? [],
      });
      relatedEntityType = "intake";
      break;
    }
    case "DELIVERY_NUDGE": {
      const meal = await prisma.meal.findUnique({
        where: { id: entityId },
        select: {
          id: true, status: true, producedAt: true, deliveredAt: true, mealDate: true,
          cbo: { select: { name: true } },
        },
      });
      if (!meal) throw new Error("Meal not found.");
      const issue: "undelivered" | "unverified" = meal.status === "PRODUCED" ? "undelivered" : "unverified";
      const since = issue === "undelivered" ? meal.producedAt : meal.deliveredAt;
      const hours = since ? (now.getTime() - since.getTime()) / HOUR_MS : 0;
      content = await draftDeliveryNudge({
        mealLabel: `Meal ${meal.id.slice(-6)} · ${dayLabel(meal.mealDate)}`,
        cboName: meal.cbo.name,
        issue,
        hours,
      });
      relatedEntityType = "meal";
      break;
    }
    case "RECONCILIATION_FLAG": {
      const c = await prisma.contract.findUnique({
        where: { id: entityId },
        select: { id: true, name: true, billingDeadline: true, funder: { select: { name: true } } },
      });
      if (!c) throw new Error("Contract not found.");
      const reason = c.billingDeadline
        ? c.billingDeadline.getTime() < now.getTime()
          ? `Billing deadline passed (was ${dayLabel(c.billingDeadline)}); invoice not yet generated.`
          : `Billing deadline approaching (${dayLabel(c.billingDeadline)}).`
        : "Contract flagged for billing review.";
      content = await draftReconciliationFlag({
        contractName: c.name,
        funderName: c.funder.name,
        reason,
      });
      relatedEntityType = "contract";
      break;
    }
    case "INCIDENT_NOTICE": {
      const inc = await prisma.incident.findUnique({
        where: { id: entityId },
        select: {
          id: true, title: true, kind: true, severity: true,
          kitchen: { select: { name: true } },
          meal: { select: { cbo: { select: { name: true } } } },
        },
      });
      if (!inc) throw new Error("Incident not found.");
      content = await draftIncidentNotice({
        title: inc.title,
        kind: KIND_LABELS[inc.kind],
        severity: inc.severity,
        kitchenName: inc.kitchen?.name ?? null,
        partnerName: inc.meal?.cbo?.name ?? null,
      });
      relatedEntityType = "incident";
      break;
    }
    case "REPORT_NARRATIVE": {
      const payload = await buildWeeklyReportPayload(now);
      content = await draftReportNarrative(payload, opts.audience ?? "board");
      relatedEntityType = "report";
      break;
    }
    default:
      throw new Error(`Unsupported draft kind: ${kind}`);
  }

  const created = await prisma.draftComm.create({
    data: {
      kind,
      relatedEntityType,
      relatedEntityId: entityId,
      subject: content.subject,
      body: content.body,
      modelUsed: content.modelUsed,
    },
  });
  return toDTO(created);
}

/** Approve or discard a draft, recording the reviewer. Optionally save human edits. */
export async function reviewDraft(
  id: string,
  decision: "APPROVED" | "DISCARDED",
  reviewedBy: string,
  edits?: { subject?: string; body?: string },
): Promise<DraftDTO> {
  const updated = await prisma.draftComm.update({
    where: { id },
    data: {
      status: decision,
      reviewedBy,
      reviewedAt: new Date(),
      ...(edits?.subject ? { subject: edits.subject } : {}),
      ...(edits?.body ? { body: edits.body } : {}),
    },
  });
  return toDTO(updated);
}

/** The review queue: drafts awaiting review first, then recently reviewed. */
export async function getDraftQueue(limit = 30): Promise<DraftDTO[]> {
  const rows = await prisma.draftComm.findMany({
    orderBy: [{ status: "asc" }, { generatedAt: "desc" }],
    take: limit,
  });
  return rows.map(toDTO);
}

function toDTO(row: {
  id: string; kind: DraftCommKind; relatedEntityType: string; relatedEntityId: string;
  subject: string; body: string; status: string; modelUsed: string; generatedAt: Date;
}): DraftDTO {
  return {
    id: row.id,
    kind: row.kind,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    subject: row.subject,
    body: row.body,
    status: row.status as DraftDTO["status"],
    modelUsed: row.modelUsed,
    generatedAt: row.generatedAt.toISOString(),
  };
}
