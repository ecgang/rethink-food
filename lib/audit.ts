import { prisma } from "@/lib/db";

export interface AuditEvent {
  id: string;
  at: Date;
  actor: string;
  action: string;
  entityType: "intake" | "field" | "invoice";
  entityLabel: string;
  href: string;
}

/**
 * Union the operator-attributed events from IntakeRequest, Meal, and Invoice,
 * sorted newest-first and sliced to `limit`. Null-actor rows are excluded.
 *
 * Meal queries are deliberately capped (each takes `limit` rows) to avoid
 * loading all ~6,900 meals into memory.
 */
export async function getAuditLog(limit = 100): Promise<AuditEvent[]> {
  const [intakeRows, deliveredRows, verifiedRows, invoiceRows] = await Promise.all([
    prisma.intakeRequest.findMany({
      where: {
        OR: [{ approvedAt: { not: null } }, { fulfilledAt: { not: null } }],
      },
      select: {
        id: true,
        status: true,
        approvedAt: true,
        approvedBy: true,
        fulfilledAt: true,
        fulfilledBy: true,
        cbo: { select: { name: true } },
      },
      orderBy: [{ approvedAt: "desc" }],
      take: limit,
    }),

    prisma.meal.findMany({
      where: { deliveredAt: { not: null }, deliveredBy: { not: null } },
      select: {
        id: true,
        mealDate: true,
        deliveredAt: true,
        deliveredBy: true,
      },
      orderBy: { deliveredAt: "desc" },
      take: limit,
    }),

    prisma.meal.findMany({
      where: { verifiedAt: { not: null }, verifiedBy: { not: null } },
      select: {
        id: true,
        mealDate: true,
        verifiedAt: true,
        verifiedBy: true,
      },
      orderBy: { verifiedAt: "desc" },
      take: limit,
    }),

    prisma.invoice.findMany({
      select: {
        id: true,
        createdAt: true,
        createdBy: true,
        contractId: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const events: AuditEvent[] = [];

  // IntakeRequest events: up to 2 per row (approved/rejected + fulfilled)
  for (const row of intakeRows) {
    const label = row.cbo?.name ?? "intake request";

    if (row.approvedAt != null && row.approvedBy != null) {
      events.push({
        id: `intake-approved-${row.id}`,
        at: row.approvedAt,
        actor: row.approvedBy,
        action:
          row.status === "REJECTED"
            ? "Rejected intake request"
            : "Approved intake request",
        entityType: "intake",
        entityLabel: label,
        href: "/intake",
      });
    }

    if (row.fulfilledAt != null && row.fulfilledBy != null) {
      events.push({
        id: `intake-fulfilled-${row.id}`,
        at: row.fulfilledAt,
        actor: row.fulfilledBy,
        action: "Fulfilled intake — scheduled meals",
        entityType: "intake",
        entityLabel: label,
        href: "/intake",
      });
    }
  }

  // Meal delivered events
  for (const row of deliveredRows) {
    if (row.deliveredAt == null || row.deliveredBy == null) continue;
    events.push({
      id: `meal-delivered-${row.id}`,
      at: row.deliveredAt,
      actor: row.deliveredBy,
      action: "Marked delivered",
      entityType: "field",
      entityLabel: `Meal ${row.id.slice(-6)} · ${row.mealDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      href: `/meals/${row.id}`,
    });
  }

  // Meal verified events
  for (const row of verifiedRows) {
    if (row.verifiedAt == null || row.verifiedBy == null) continue;
    events.push({
      id: `meal-verified-${row.id}`,
      at: row.verifiedAt,
      actor: row.verifiedBy,
      action: "Verified delivery",
      entityType: "field",
      entityLabel: `Meal ${row.id.slice(-6)} · ${row.mealDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      href: `/meals/${row.id}`,
    });
  }

  // Invoice events
  for (const row of invoiceRows) {
    events.push({
      id: `invoice-${row.id}`,
      at: row.createdAt,
      actor: row.createdBy,
      action: "Generated invoice",
      entityType: "invoice",
      entityLabel: `Invoice ${row.id.slice(-6)}`,
      href: `/contracts/${row.contractId}`,
    });
  }

  // Sort newest-first, slice to limit
  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  return events.slice(0, limit);
}
