"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markDelivered, markProduced, markVerified } from "@/app/actions/field";
import { downscale } from "@/lib/photo";

export interface FieldCardData {
  id: string;
  stage: "produce" | "deliver" | "verify";
  programName: string;
  cboName: string;
  marketLabel: string;
  kitchenName: string | null;
  ageLabel: string;
  overdue: boolean;
  deliveryPhotoUrl: string | null;
  canOperate: boolean;
}

export function FieldCard(props: FieldCardData) {
  const { id, stage, programName, cboName, marketLabel, ageLabel, overdue } = props;
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const small = await downscale(file);
      setPhoto(small);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(small);
      });
    } catch {
      setError("Couldn't process that photo — try again.");
    }
  }

  function runDeliver() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("mealId", id);
      if (photo) fd.set("photo", photo, "delivery.jpg");
      try {
        const res = await markDelivered(fd);
        if (!res.ok) setError(res.error);
        else router.refresh();
      } catch {
        setError("Couldn't save — check your connection and retry.");
      }
    });
  }

  function runVerify() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await markVerified(id);
        if (!res.ok) setError(res.error);
        else router.refresh();
      } catch {
        setError("Couldn't save — check your connection and retry.");
      }
    });
  }

  function runProduce() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await markProduced(id);
        if (!res.ok) setError(res.error);
        else router.refresh();
      } catch {
        setError("Couldn't save — check your connection and retry.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display font-bold tracking-tight truncate">{cboName}</div>
          <div className="text-xs text-muted mt-0.5 truncate">
            {programName} · {marketLabel}
            {stage === "produce" && props.kitchenName ? ` · ${props.kitchenName}` : ""}
          </div>
        </div>
        <span
          className={
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums " +
            (overdue
              ? "bg-[var(--sev-critical-bg)] text-[var(--sev-critical)]"
              : "bg-[var(--sev-low-bg)] text-[var(--sev-low)]")
          }
        >
          {overdue ? "Overdue · " : ""}
          {ageLabel}
        </span>
      </div>

      {stage === "verify" && props.deliveryPhotoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.deliveryPhotoUrl}
          alt="Delivery proof"
          className="mt-3 h-40 w-full rounded-lg object-cover"
        />
      )}

      {stage === "deliver" && preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Delivery preview" className="mt-3 h-40 w-full rounded-lg object-cover" />
      )}

      {error && <p className="mt-3 text-xs text-[var(--sev-critical)]">{error}</p>}

      <div className="mt-3 flex gap-2">
        {stage === "deliver" ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onPick}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!props.canOperate || pending}
              className="flex-1 rounded-lg border border-border py-3 text-sm font-medium active:scale-[0.99] disabled:opacity-40"
            >
              {photo ? "Retake photo" : "Add photo"}
            </button>
            <button
              type="button"
              onClick={runDeliver}
              disabled={!props.canOperate || pending}
              className="flex-1 rounded-lg bg-brand py-3 text-sm font-bold text-brand-ink active:scale-[0.99] disabled:opacity-40"
            >
              {pending ? "Saving…" : "Mark delivered"}
            </button>
          </>
        ) : stage === "produce" ? (
          <button
            type="button"
            onClick={runProduce}
            disabled={!props.canOperate || pending}
            className="flex-1 rounded-lg bg-brand py-3 text-sm font-bold text-brand-ink active:scale-[0.99] disabled:opacity-40"
          >
            {pending ? "Saving…" : "Mark produced"}
          </button>
        ) : (
          <button
            type="button"
            onClick={runVerify}
            disabled={!props.canOperate || pending}
            className="flex-1 rounded-lg bg-brand py-3 text-sm font-bold text-brand-ink active:scale-[0.99] disabled:opacity-40"
          >
            {pending ? "Saving…" : "Verify delivery"}
          </button>
        )}
      </div>

      {!props.canOperate && (
        <p className="mt-2 text-[11px] text-muted">
          Your role is read-only here. Switch to Operations to update meals.
        </p>
      )}
    </div>
  );
}
