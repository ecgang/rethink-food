// Pure incident helpers — no Prisma, no Next.js imports. Safe to use from
// client components and server-side code alike, and fully unit-testable.

export type IncidentKind = "FOOD_SAFETY" | "QUALITY" | "DELIVERY" | "EQUIPMENT" | "OTHER";
export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export const SEVERITY_ORDER: Record<IncidentSeverity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export const KIND_LABELS: Record<IncidentKind, string> = {
  FOOD_SAFETY: "Food Safety",
  QUALITY: "Quality",
  DELIVERY: "Delivery",
  EQUIPMENT: "Equipment",
  OTHER: "Other",
};

export const SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export interface IncidentItem {
  id: string;
  kind: IncidentKind;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  reportedAt: Date;
}

/** True for OPEN and ACKNOWLEDGED (anything not yet resolved). */
export function isOpen(status: IncidentStatus): boolean {
  return status === "OPEN" || status === "ACKNOWLEDGED";
}

/**
 * Sort incidents: open before resolved, then by severity descending,
 * then newest reportedAt first. Non-mutating.
 */
export function sortIncidents<T extends IncidentItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    // Open before resolved
    const aOpen = isOpen(a.status) ? 0 : 1;
    const bOpen = isOpen(b.status) ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;

    // Higher severity first
    const sevDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
    if (sevDiff !== 0) return sevDiff;

    // Newest first within a tie
    return b.reportedAt.getTime() - a.reportedAt.getTime();
  });
}

/** Count of incidents that are not yet resolved. */
export function openCount(items: IncidentItem[]): number {
  return items.filter((i) => isOpen(i.status)).length;
}

/**
 * True when the incident is open AND severity is HIGH or CRITICAL.
 * Used to drive "act on today" dashboard exceptions.
 */
export function isActionable(severity: IncidentSeverity, status: IncidentStatus): boolean {
  return isOpen(status) && (severity === "HIGH" || severity === "CRITICAL");
}
