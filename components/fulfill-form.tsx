"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fulfillIntake, type FulfillResult } from "@/app/actions/intake-fulfill";
import type { EligibleProducer, MatchOptionsContract } from "@/lib/partners";

interface FulfillFormProps {
  requestId: string;
  suggestedProducerId: string | null;
  suggestedContractId: string | null;
  defaultQuantity: number | null;
  producers: EligibleProducer[];
  contracts: MatchOptionsContract[];
}

export function FulfillForm({
  requestId,
  suggestedProducerId,
  suggestedContractId,
  defaultQuantity,
  producers,
  contracts,
}: FulfillFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedProducerId, setSelectedProducerId] = useState<string>(
    suggestedProducerId ?? producers[0]?.id ?? "",
  );

  const selectedProducer = producers.find((p) => p.id === selectedProducerId);

  if (producers.length === 0) {
    return (
      <p className="text-xs text-muted italic">
        No producer with spare capacity — cannot schedule.
      </p>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const form = e.currentTarget;
    const fd = new FormData(form);

    // Inject derived producerType from selected producer
    fd.set("producerType", selectedProducer?.type ?? "kitchen");

    startTransition(async () => {
      let result: FulfillResult;
      try {
        result = await fulfillIntake(fd);
      } catch {
        setError("Couldn't save — check your connection and retry.");
        return;
      }

      if (!result.ok) {
        setError(result.error);
      } else {
        setSuccess(`Scheduled ${result.created} meal${result.created === 1 ? "" : "s"}.`);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Hidden fields */}
      <input type="hidden" name="requestId" value={requestId} />

      <div className="grid gap-3 sm:grid-cols-3">
        {/* Producer */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`fulfill-producer-${requestId}`}
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted"
          >
            Producer
          </label>
          <select
            id={`fulfill-producer-${requestId}`}
            name="producerId"
            value={selectedProducerId}
            onChange={(e) => setSelectedProducerId(e.target.value)}
            disabled={pending}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
          >
            {producers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — spare {p.spare}
              </option>
            ))}
          </select>
        </div>

        {/* Contract */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`fulfill-contract-${requestId}`}
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted"
          >
            Contract
          </label>
          <select
            id={`fulfill-contract-${requestId}`}
            name="contractId"
            defaultValue={suggestedContractId ?? contracts[0]?.id ?? ""}
            disabled={pending || contracts.length === 0}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
          >
            {contracts.length === 0 ? (
              <option value="">No contracts</option>
            ) : (
              contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Quantity */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`fulfill-quantity-${requestId}`}
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted"
          >
            Quantity
          </label>
          <input
            id={`fulfill-quantity-${requestId}`}
            name="quantity"
            type="number"
            min={1}
            max={selectedProducer?.spare ?? 1}
            defaultValue={defaultQuantity ?? 1}
            disabled={pending}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm tnum focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
          />
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <p className="text-xs text-[var(--sev-critical)]">{error}</p>
      )}
      {success && (
        <p className="text-xs text-[var(--pos)] font-medium">{success}</p>
      )}

      <button
        type="submit"
        disabled={pending || contracts.length === 0}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-ink active:scale-[0.99] disabled:opacity-40"
      >
        {pending ? "Scheduling…" : "Schedule meals"}
      </button>
    </form>
  );
}
