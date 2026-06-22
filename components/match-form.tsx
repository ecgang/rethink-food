"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { matchSupply, type MatchResult } from "@/app/actions/match";
import type { EligibleProducer, MatchOptionsContract, MatchOptionsCbo } from "@/lib/partners";

interface MatchFormProps {
  marketId: string;
  slug: string;
  producers: EligibleProducer[];
  contracts: MatchOptionsContract[];
  cbos: MatchOptionsCbo[];
}

export function MatchForm({
  marketId,
  slug,
  producers,
  contracts,
  cbos,
}: MatchFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedProducerId, setSelectedProducerId] = useState<string>(
    producers[0]?.id ?? "",
  );

  const selectedProducer = producers.find((p) => p.id === selectedProducerId);

  if (producers.length === 0) {
    return (
      <p className="text-sm text-muted">
        No producers with spare capacity in this market.
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
      let result: MatchResult;
      try {
        result = await matchSupply(fd);
      } catch {
        setError("Couldn't save — check your connection and retry.");
        return;
      }

      if (!result.ok) {
        setError(result.error);
      } else {
        setSuccess(`Scheduled ${result.created} meal${result.created === 1 ? "" : "s"}.`);
        form.reset();
        setSelectedProducerId(producers[0]?.id ?? "");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Hidden fields */}
      <input type="hidden" name="marketId" value={marketId} />
      <input type="hidden" name="slug" value={slug} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Producer */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="match-producer"
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted"
          >
            Producer
          </label>
          <select
            id="match-producer"
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
            htmlFor="match-contract"
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted"
          >
            Contract
          </label>
          <select
            id="match-contract"
            name="contractId"
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

        {/* CBO */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="match-cbo"
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted"
          >
            CBO
          </label>
          <select
            id="match-cbo"
            name="cboId"
            disabled={pending || cbos.length === 0}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
          >
            {cbos.length === 0 ? (
              <option value="">No CBOs</option>
            ) : (
              cbos.map((c) => (
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
            htmlFor="match-quantity"
            className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted"
          >
            Quantity
          </label>
          <input
            id="match-quantity"
            name="quantity"
            type="number"
            min={1}
            max={selectedProducer?.spare ?? 1}
            defaultValue={1}
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
        disabled={pending || contracts.length === 0 || cbos.length === 0}
        className="rounded-lg bg-brand px-5 py-2.5 text-sm font-bold text-brand-ink active:scale-[0.99] disabled:opacity-40"
      >
        {pending ? "Scheduling…" : "Schedule meals"}
      </button>
    </form>
  );
}
