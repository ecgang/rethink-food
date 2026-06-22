// Automated reporting layer — weekly funder & board snapshots.
//
// buildWeeklyReportPayload  — compute the payload (pure, no DB writes).
// persistWeeklyReport       — build + persist to ReportSnapshot.
// getReportSnapshots        — list recent snapshots.

import { prisma } from "@/lib/db";
import { getFundersRoster, type FunderRosterRow } from "@/lib/funders";
import { realizedTotals } from "@/lib/aggregates";

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Payload shape
// ---------------------------------------------------------------------------

export interface WeeklyReportPayload {
  periodStart: string; // ISO-8601
  periodEnd: string; // ISO-8601
  totals: {
    mealsServed: number;
    dollarsDeliveredCents: number;
    contributionMarginCents: number;
  };
  funders: FunderRosterRow[];
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Compute the weekly funder/board summary payload without writing to the DB.
 * Period = the 7 days ending at `now` (exclusive upper bound = now).
 */
export async function buildWeeklyReportPayload(
  now: Date = new Date(),
): Promise<WeeklyReportPayload> {
  const periodEnd = now;
  const periodStart = new Date(now.getTime() - 7 * DAY_MS);

  const [totals, funders] = await Promise.all([
    realizedTotals({ deliveredAt: { gte: periodStart, lt: periodEnd } }),
    getFundersRoster(),
  ]);

  return {
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    totals: {
      mealsServed: totals.mealCount,
      dollarsDeliveredCents: totals.revenueCents,
      contributionMarginCents: totals.marginCents,
    },
    funders,
  };
}

/**
 * Build the payload and persist a FUNDER_IMPACT ReportSnapshot.
 * Returns the created row.
 */
export async function persistWeeklyReport(
  generatedBy: string,
  now: Date = new Date(),
) {
  const payload = await buildWeeklyReportPayload(now);

  const weekLabel = new Date(payload.periodStart).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Prisma's Json field accepts any JSON-serializable value. Casting through
  // `unknown` is unavoidable here because TypeScript cannot infer that our
  // strongly-typed payload satisfies Prisma's opaque InputJsonValue. The cast
  // is safe: WeeklyReportPayload is fully serializable (no Dates/BigInts).
  const jsonPayload = payload as unknown as Parameters<
    typeof prisma.reportSnapshot.create
  >[0]["data"]["payload"];

  const row = await prisma.reportSnapshot.create({
    data: {
      kind: "FUNDER_IMPACT",
      title: `Funder impact — week of ${weekLabel}`,
      periodStart: new Date(payload.periodStart),
      periodEnd: new Date(payload.periodEnd),
      payload: jsonPayload,
      generatedBy,
    },
  });

  return row;
}

/**
 * List recent ReportSnapshots, newest first.
 */
export async function getReportSnapshots(limit = 20) {
  return prisma.reportSnapshot.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
