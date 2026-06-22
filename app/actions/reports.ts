"use server";

import { revalidatePath } from "next/cache";
import { getCurrentRole, getOperatorIdentity } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { persistWeeklyReport } from "@/lib/reports";

/**
 * Generate a funder impact snapshot now (demo "Generate now" button).
 * Gated by view:financials — only EXEC and FINANCE roles may trigger this.
 */
export async function generateReportNow(): Promise<void> {
  const role = await getCurrentRole();
  if (!can(role, "view:financials")) {
    throw new Error("Your role does not have permission to generate reports.");
  }

  const identity = await getOperatorIdentity();
  await persistWeeklyReport(identity);

  revalidatePath("/reports");
}
