"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateInvoice, type InvoiceResult } from "@/app/actions/billing";
import { formatUsd } from "@/lib/money";

/** Generates an invoice for the contract's uninvoiced verified meals. */
export function InvoiceAction({
  contractId,
  uninvoicedCount,
  uninvoicedAmountCents,
  canInvoice,
}: {
  contractId: string;
  uninvoicedCount: number;
  uninvoicedAmountCents: number;
  canInvoice: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const disabled = !canInvoice || uninvoicedCount === 0 || pending;

  const onClick = () => {
    setError(null);
    setMsg(null);
    start(async () => {
      try {
        const res: InvoiceResult = await generateInvoice(contractId);
        if (!res.ok) setError(res.error);
        else {
          setMsg(`Invoiced ${res.mealCount} meals — ${formatUsd(res.amountCents)}`);
          router.refresh();
        }
      } catch {
        setError("Couldn't generate invoice — try again.");
      }
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-ink active:scale-[0.99] disabled:opacity-40"
      >
        {pending ? "Submitting…" : "Generate & submit invoice"}
      </button>
      <p className="mt-2 text-xs text-muted tnum">
        {uninvoicedCount > 0
          ? `${uninvoicedCount} verified meals · ${formatUsd(uninvoicedAmountCents)} ready to invoice`
          : "Nothing new to invoice."}
      </p>
      {!canInvoice && (
        <p className="mt-1 text-[11px] text-muted">Finance or Exec role required.</p>
      )}
      {msg && <p className="mt-1 text-xs text-brand-deep">{msg}</p>}
      {error && <p className="mt-1 text-xs text-[var(--sev-critical)]">{error}</p>}
    </div>
  );
}
