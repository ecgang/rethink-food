"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitSafetyCheck } from "@/app/actions/safety";
import {
  CHECKLISTS,
  type SafetyCheckKind,
  type CheckResponse,
} from "@/lib/safety";

interface Kitchen {
  id: string;
  name: string;
}

interface Props {
  kitchens: Kitchen[];
  canOperate: boolean;
}

const KIND_LABELS: Record<SafetyCheckKind, string> = {
  FOOD_SAFETY: "Food Safety",
  QUALITY: "Quality (QA)",
};

const KINDS: SafetyCheckKind[] = ["FOOD_SAFETY", "QUALITY"];

export function SafetyForm({ kitchens, canOperate }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [kind, setKind] = useState<SafetyCheckKind>("FOOD_SAFETY");
  // itemId → "ok" | "fail" | undefined (unset)
  const [responses, setResponses] = useState<Record<string, "ok" | "fail">>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [temperatureF, setTemperatureF] = useState("");
  const [kitchenId, setKitchenId] = useState("");
  const [mealDate, setMealDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset item responses when kind changes
  function handleKindChange(next: SafetyCheckKind) {
    setKind(next);
    setResponses({});
    setNotes({});
  }

  function setItemResponse(itemId: string, value: "ok" | "fail") {
    setResponses((prev) => ({ ...prev, [itemId]: value }));
  }

  function setItemNote(itemId: string, value: string) {
    setNotes((prev) => ({ ...prev, [itemId]: value }));
  }

  function reset() {
    setKind("FOOD_SAFETY");
    setResponses({});
    setNotes({});
    setTemperatureF("");
    setKitchenId("");
    setMealDate("");
    setError(null);
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const items = CHECKLISTS[kind];
      const built: CheckResponse[] = items
        .filter((item) => responses[item.id] !== undefined)
        .map((item) => ({
          itemId: item.id,
          ok: responses[item.id] === "ok",
          ...(notes[item.id]?.trim() ? { note: notes[item.id].trim() } : {}),
        }));

      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("responses", JSON.stringify(built));
      if (temperatureF.trim()) fd.set("temperatureF", temperatureF.trim());
      if (kitchenId) fd.set("kitchenId", kitchenId);
      if (mealDate) fd.set("mealDate", mealDate);

      try {
        const res = await submitSafetyCheck(fd);
        if (!res.ok) {
          setError(res.error);
        } else {
          router.refresh();
          reset();
        }
      } catch {
        setError("Couldn't save — check your connection and retry.");
      }
    });
  }

  const items = CHECKLISTS[kind];

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {/* Kind toggle */}
      <div className="flex gap-2 mb-4">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => handleKindChange(k)}
            disabled={pending}
            className={
              "flex-1 rounded-lg border py-2 text-sm font-medium active:scale-[0.99] disabled:opacity-40 " +
              (kind === k
                ? "border-brand bg-brand text-brand-ink font-bold"
                : "border-border")
            }
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {/* Checklist items */}
      <div className="flex flex-col gap-3 mb-4">
        {items.map((item) => {
          const val = responses[item.id];
          return (
            <div key={item.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">
                  {item.label}
                  {item.required && (
                    <span className="ml-1 text-[var(--sev-critical)] text-xs">*</span>
                  )}
                </span>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setItemResponse(item.id, "ok")}
                    disabled={pending}
                    className={
                      "rounded-lg border px-3 py-1 text-xs font-medium active:scale-[0.99] disabled:opacity-40 " +
                      (val === "ok"
                        ? "border-[var(--sev-low)] bg-[var(--sev-low-bg)] text-[var(--sev-low)] font-bold"
                        : "border-border")
                    }
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemResponse(item.id, "fail")}
                    disabled={pending}
                    className={
                      "rounded-lg border px-3 py-1 text-xs font-medium active:scale-[0.99] disabled:opacity-40 " +
                      (val === "fail"
                        ? "border-[var(--sev-critical)] bg-[var(--sev-critical-bg)] text-[var(--sev-critical)] font-bold"
                        : "border-border")
                    }
                  >
                    Fail
                  </button>
                </div>
              </div>
              {val === "fail" && (
                <input
                  type="text"
                  placeholder="Note (optional)"
                  value={notes[item.id] ?? ""}
                  onChange={(e) => setItemNote(item.id, e.target.value)}
                  disabled={pending}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-xs placeholder:text-muted disabled:opacity-40"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Temperature */}
      <div className="mb-3">
        <label className="block text-xs text-muted mb-1">
          Temperature (°F){kind === "FOOD_SAFETY" && (
            <span className="ml-1 text-[var(--sev-critical)]">* cold-holding ≤ 41°F</span>
          )}
        </label>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          placeholder="e.g. 38"
          value={temperatureF}
          onChange={(e) => setTemperatureF(e.target.value)}
          disabled={pending}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted disabled:opacity-40"
        />
      </div>

      {/* Optional: kitchen */}
      {kitchens.length > 0 && (
        <div className="mb-3">
          <label className="block text-xs text-muted mb-1">Kitchen (optional)</label>
          <select
            value={kitchenId}
            onChange={(e) => setKitchenId(e.target.value)}
            disabled={pending}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm disabled:opacity-40"
          >
            <option value="">— none —</option>
            {kitchens.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Optional: meal date */}
      <div className="mb-4">
        <label className="block text-xs text-muted mb-1">Meal date (optional)</label>
        <input
          type="date"
          value={mealDate}
          onChange={(e) => setMealDate(e.target.value)}
          disabled={pending}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm disabled:opacity-40"
        />
      </div>

      {error && (
        <p className="mb-3 text-xs text-[var(--sev-critical)]">{error}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canOperate || pending}
        className="w-full rounded-lg bg-brand py-3 text-sm font-bold text-brand-ink active:scale-[0.99] disabled:opacity-40"
      >
        {pending ? "Saving…" : "Submit check"}
      </button>

      {!canOperate && (
        <p className="mt-2 text-[11px] text-muted">
          Your role is read-only here. Switch to Operations to submit checks.
        </p>
      )}
    </div>
  );
}
