"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resolveIncident } from "@/app/actions/incidents";
import { generateDraftAction } from "@/app/actions/comms";
import { KIND_LABELS, SEVERITY_LABELS, isOpen, type IncidentKind, type IncidentSeverity, type IncidentStatus } from "@/lib/incidents";

export interface IncidentRowProps {
  id: string;
  kind: IncidentKind;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  reportedAt: Date;
  kitchenName?: string | null;
  photoUrl?: string | null;
  resolvedAt?: Date | null;
  resolutionNote?: string | null;
  canOperate: boolean;
}

const SEV_COLORS: Record<IncidentSeverity, { bg: string; text: string }> = {
  CRITICAL: {
    bg: "var(--sev-critical-bg, var(--sev-critical))",
    text: "var(--sev-critical)",
  },
  HIGH: {
    bg: "var(--sev-high-bg, var(--sev-critical-bg, var(--sev-critical)))",
    text: "var(--sev-high, var(--sev-critical))",
  },
  MEDIUM: {
    bg: "var(--sev-medium-bg)",
    text: "var(--sev-medium)",
  },
  LOW: {
    bg: "var(--sev-low-bg)",
    text: "var(--sev-low)",
  },
};

export function IncidentRow({
  id,
  kind,
  severity,
  status,
  title,
  description,
  reportedAt,
  kitchenName,
  photoUrl,
  resolvedAt,
  resolutionNote,
  canOperate,
}: IncidentRowProps) {
  const router = useRouter();
  const [showResolve, setShowResolve] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draftPending, startDraft] = useTransition();
  const [draftDone, setDraftDone] = useState(false);

  const open = isOpen(status);
  const sev = SEV_COLORS[severity];

  function draftNotice() {
    setError(null);
    startDraft(async () => {
      try {
        const res = await generateDraftAction({ kind: "INCIDENT_NOTICE", entityId: id });
        if (!res.ok) setError(res.error);
        else setDraftDone(true);
      } catch {
        setError("Couldn't draft — check your connection and retry.");
      }
    });
  }

  function submitResolve() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("incidentId", id);
      if (note.trim()) fd.set("resolutionNote", note.trim());
      try {
        const res = await resolveIncident(fd);
        if (!res.ok) {
          setError(res.error);
        } else {
          setShowResolve(false);
          setNote("");
          router.refresh();
        }
      } catch {
        setError("Couldn't save — check your connection and retry.");
      }
    });
  }

  const ts = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(reportedAt);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Severity badge + kind */}
          <div className="mb-1 flex items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{
                background: sev.bg,
                color: sev.text,
              }}
            >
              {SEVERITY_LABELS[severity]}
            </span>
            <span className="text-xs text-muted">{KIND_LABELS[kind]}</span>
          </div>

          <div className="font-display font-bold leading-snug">{title}</div>
          <p className="mt-1 text-xs text-muted line-clamp-2">{description}</p>

          {/* Meta: kitchen + timestamp */}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
            {kitchenName && <span>{kitchenName}</span>}
            <span>{ts}</span>
          </div>
        </div>

        {/* Status badge */}
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            open ? "text-[var(--sev-high,var(--sev-critical))]" : "text-muted"
          }`}
        >
          {status === "ACKNOWLEDGED" ? "Acknowledged" : open ? "Open" : "Resolved"}
        </span>
      </div>

      {/* Optional photo */}
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt="Incident proof"
          className="mt-3 h-40 w-full rounded-lg object-cover"
        />
      )}

      {/* Resolved state */}
      {!open && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-[11px] text-muted">
            Resolved{" "}
            {resolvedAt &&
              new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }).format(resolvedAt)}
          </p>
          {resolutionNote && (
            <p className="mt-1 text-xs text-muted">{resolutionNote}</p>
          )}
        </div>
      )}

      {/* Resolve + partner-comms actions (open incidents, operators only) */}
      {open && canOperate && (
        <div className="mt-3">
          {draftDone && (
            <p className="mb-2 text-[11px] text-muted">
              Partner notice drafted —{" "}
              <Link href="/drafts" className="font-medium underline">
                review &amp; approve in Drafts
              </Link>
              . Nothing is sent automatically.
            </p>
          )}
          {!showResolve && error && (
            <p className="mb-2 text-xs text-[var(--sev-critical)]">{error}</p>
          )}
          {!showResolve ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={draftNotice}
                disabled={draftPending || draftDone}
                className="flex-1 rounded-lg border border-border py-3 text-sm font-medium active:scale-[0.99] disabled:opacity-40"
              >
                {draftPending ? "Drafting…" : draftDone ? "Notice drafted" : "Draft partner notice"}
              </button>
              <button
                type="button"
                onClick={() => setShowResolve(true)}
                disabled={pending}
                className="flex-1 rounded-lg bg-brand py-3 text-sm font-bold text-brand-ink active:scale-[0.99] disabled:opacity-40"
              >
                Resolve
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={pending}
                maxLength={2000}
                rows={2}
                placeholder="Resolution note (optional)"
                className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm disabled:opacity-40"
              />
              {error && (
                <p className="text-xs text-[var(--sev-critical)]">{error}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowResolve(false);
                    setNote("");
                    setError(null);
                  }}
                  disabled={pending}
                  className="flex-1 rounded-lg border border-border py-3 text-sm font-medium active:scale-[0.99] disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitResolve}
                  disabled={pending}
                  className="flex-1 rounded-lg bg-brand py-3 text-sm font-bold text-brand-ink active:scale-[0.99] disabled:opacity-40"
                >
                  {pending ? "Saving…" : "Confirm resolve"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
