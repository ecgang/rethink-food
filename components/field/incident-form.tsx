"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reportIncident } from "@/app/actions/incidents";
import { downscale } from "@/lib/photo";
import { KIND_LABELS, SEVERITY_LABELS, type IncidentKind, type IncidentSeverity } from "@/lib/incidents";

export interface IncidentFormProps {
  kitchens: { id: string; name: string }[];
  canOperate: boolean;
}

const KINDS = Object.keys(KIND_LABELS) as IncidentKind[];
const SEVERITIES = Object.keys(SEVERITY_LABELS) as IncidentSeverity[];

export function IncidentForm({ kitchens, canOperate }: IncidentFormProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // controlled form state
  const [kind, setKind] = useState<IncidentKind>("OTHER");
  const [severity, setSeverity] = useState<IncidentSeverity>("MEDIUM");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kitchenId, setKitchenId] = useState("");

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

  function reset() {
    setKind("OTHER");
    setSeverity("MEDIUM");
    setTitle("");
    setDescription("");
    setKitchenId("");
    setPhoto(null);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("severity", severity);
      fd.set("title", title);
      fd.set("description", description);
      if (kitchenId) fd.set("kitchenId", kitchenId);
      if (photo) fd.set("photo", photo, "incident.jpg");
      try {
        const res = await reportIncident(fd);
        if (!res.ok) {
          setError(res.error);
        } else {
          reset();
          router.refresh();
        }
      } catch {
        setError("Couldn't save — check your connection and retry.");
      }
    });
  }

  const labelCls = "block text-xs font-medium text-muted mb-1";
  const inputCls =
    "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm disabled:opacity-40";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h2 className="font-display font-bold mb-3">Report incident</h2>

      <div className="flex gap-2 mb-3">
        <div className="flex-1">
          <label className={labelCls}>Kind</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as IncidentKind)}
            disabled={!canOperate || pending}
            className={inputCls}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label className={labelCls}>Severity</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
            disabled={!canOperate || pending}
            className={inputCls}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-3">
        <label className={labelCls}>Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!canOperate || pending}
          maxLength={200}
          placeholder="Brief description of what happened"
          className={inputCls}
        />
      </div>

      <div className="mb-3">
        <label className={labelCls}>Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canOperate || pending}
          maxLength={2000}
          rows={3}
          placeholder="Details, context, immediate actions taken…"
          className={`${inputCls} resize-none`}
        />
      </div>

      {kitchens.length > 0 && (
        <div className="mb-3">
          <label className={labelCls}>Kitchen (optional)</label>
          <select
            value={kitchenId}
            onChange={(e) => setKitchenId(e.target.value)}
            disabled={!canOperate || pending}
            className={inputCls}
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

      {/* Photo capture */}
      <div className="mb-3">
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
          disabled={!canOperate || pending}
          className="w-full rounded-lg border border-border py-3 text-sm font-medium active:scale-[0.99] disabled:opacity-40"
        >
          {photo ? "Retake photo" : "Add photo (optional)"}
        </button>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Incident preview"
            className="mt-2 h-40 w-full rounded-lg object-cover"
          />
        )}
      </div>

      {error && <p className="mb-3 text-xs text-[var(--sev-critical)]">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={!canOperate || pending || !title || !description}
        className="w-full rounded-lg bg-brand py-3 text-sm font-bold text-brand-ink active:scale-[0.99] disabled:opacity-40"
      >
        {pending ? "Saving…" : "Report incident"}
      </button>

      {!canOperate && (
        <p className="mt-2 text-[11px] text-muted">
          Your role is read-only here. Switch to Operations to report incidents.
        </p>
      )}
    </div>
  );
}
