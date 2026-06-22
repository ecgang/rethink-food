"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentRole, getOperatorIdentity } from "@/lib/current-role";
import { can } from "@/lib/roles";

export type InvoiceResult =
  | { ok: true; invoiceId: string; mealCount: number; amountCents: number }
  | { ok: false; error: string };

const idSchema = z.string().min(1).max(64);

/**
 * Generate & submit an invoice for a contract's verified-but-uninvoiced meals.
 * Records an Invoice row (audit) and stamps Contract.lastInvoicedAt, which clears
 * the CONTRACT_BILLING_* exception for the cycle — closing the reimbursement loop
 * straight from the "Act on today" feed.
 */
export async function generateInvoice(contractId: string): Promise<InvoiceResult> {
  const role = await getCurrentRole();
  if (!can(role, "invoice:contract")) {
    return { ok: false, error: "Your role can't generate invoices." };
  }
  const parsed = idSchema.safeParse(contractId);
  if (!parsed.success) return { ok: false, error: "Missing contract." };
  const operator = await getOperatorIdentity();

  const contract = await prisma.contract.findUnique({
    where: { id: parsed.data },
    select: {
      id: true,
      lastInvoicedAt: true,
      program: { select: { reimbursementRateCents: true } },
      meals: { where: { status: "VERIFIED" }, select: { verifiedAt: true } },
    },
  });
  if (!contract) return { ok: false, error: "Contract not found." };

  const rate = contract.program.reimbursementRateCents;
  const since = contract.lastInvoicedAt;
  const verified = contract.meals.filter(
    (m) => m.verifiedAt && (!since || m.verifiedAt.getTime() > since.getTime()),
  );
  if (verified.length === 0) {
    return { ok: false, error: "No new verified meals to invoice." };
  }

  const times = verified.map((m) => m.verifiedAt!.getTime());
  const periodStart = since ?? new Date(Math.min(...times));
  const periodEnd = new Date(Math.max(...times));
  const amountCents = verified.length * rate;

  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        contractId: contract.id,
        periodStart,
        periodEnd,
        mealCount: verified.length,
        amountCents: BigInt(amountCents),
        status: "SUBMITTED",
        createdBy: operator,
      },
    });
    await tx.contract.update({
      where: { id: contract.id },
      data: { lastInvoicedAt: new Date() },
    });
    return inv;
  });

  revalidatePath("/");
  revalidatePath(`/contracts/${contract.id}`);
  return { ok: true, invoiceId: invoice.id, mealCount: verified.length, amountCents };
}
