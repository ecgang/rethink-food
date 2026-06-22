"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markDelivered, markVerified, type FieldResult } from "@/app/actions/field";

/**
 * Inline lifecycle action on the meal detail page — the exec/ops path that
 * mirrors the field app. Advancing a meal revalidates the dashboard, so the
 * matching "Act on today" exception clears.
 */
export function MealActions({
  mealId,
  status,
  canOperate,
}: {
  mealId: string;
  status: "PLANNED" | "PRODUCED" | "DELIVERED" | "VERIFIED";
  canOperate: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (status !== "PRODUCED" && status !== "DELIVERED") return null;

  const run = (fn: () => Promise<FieldResult>) => {
    setError(null);
    start(async () => {
      try {
        const res = await fn();
        if (!res.ok) setError(res.error);
        else router.refresh();
      } catch {
        setError("Couldn't save — check your connection and retry.");
      }
    });
  };

  const label = status === "PRODUCED" ? "Mark delivered" : "Verify delivery";
  const onClick = () => {
    if (status === "PRODUCED") {
      const fd = new FormData();
      fd.set("mealId", mealId);
      run(() => markDelivered(fd));
    } else {
      run(() => markVerified(mealId));
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={!canOperate || pending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-ink active:scale-[0.99] disabled:opacity-40"
      >
        {pending ? "Saving…" : label}
      </button>
      {error && <p className="mt-2 text-xs text-[var(--sev-critical)]">{error}</p>}
      {!canOperate && (
        <p className="mt-2 text-[11px] text-muted">
          Read-only for your role — switch to Operations to update lifecycle.
        </p>
      )}
    </div>
  );
}
