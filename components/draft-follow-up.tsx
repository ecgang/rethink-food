"use client";

import { useState, useTransition } from "react";
import { PenLine, Check, X, Copy } from "lucide-react";
import { cn } from "@/lib/cn";
import { generateDraftAction, reviewDraftAction } from "@/app/actions/comms";
import type { DraftDTO } from "@/lib/comms";
import type { DraftCommKind } from "@prisma/client";

const STATUS_STYLES: Record<DraftDTO["status"], string> = {
  DRAFT: "bg-[#fefbe8] text-[#b58a00]",
  APPROVED: "bg-[#e7f3ec] text-[#1f7a52]",
  DISCARDED: "bg-[#fef3f2] text-[#b42318]",
};

/** Controlled modal to review one draft: edit, approve, discard, or copy. Never sends. */
export function DraftReviewModal({
  draft,
  onClose,
}: {
  draft: DraftDTO;
  onClose: (updated?: DraftDTO) => void;
}) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [status, setStatus] = useState<DraftDTO["status"]>(draft.status);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const locked = status !== "DRAFT";

  function review(decision: "APPROVED" | "DISCARDED") {
    startTransition(async () => {
      const r = await reviewDraftAction({ id: draft.id, decision, subject, body });
      if (r.ok) {
        setStatus(r.draft.status);
        onClose(r.draft);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={() => onClose()}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.16em]">Draft follow-up</h2>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_STYLES[status])}>
              {status}
            </span>
          </div>
          <button type="button" onClick={() => onClose()} aria-label="Close" className="text-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] font-medium text-muted">
            AI draft · review before sending · {draft.modelUsed}
          </span>
          <label className="mt-3 block text-xs font-medium text-muted">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={locked}
            className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-deep disabled:opacity-60"
          />
          <label className="mt-3 block text-xs font-medium text-muted">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={locked}
            rows={9}
            className="mt-1 w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-relaxed outline-none focus:border-brand-deep disabled:opacity-60"
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(`${subject}\n\n${body}`);
              setCopied(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground/70 hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
          </button>
          {!locked && (
            <>
              <button
                type="button"
                onClick={() => review("DISCARDED")}
                disabled={pending}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-[#b42318] hover:bg-[#fef3f2]"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => review("APPROVED")}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink hover:bg-brand-deep hover:text-white"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> {pending ? "Saving…" : "Approve"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Button that generates a draft for an entity, then opens the review modal. */
export function DraftFollowUpButton({
  kind,
  entityId,
  audience,
  label = "Draft follow-up",
  className,
}: {
  kind: DraftCommKind;
  entityId: string;
  audience?: "board" | "funder";
  label?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<DraftDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      setError(null);
      const r = await generateDraftAction({ kind, entityId, audience });
      if (r.ok) setDraft(r.draft);
      else setError(r.error);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={generate}
        disabled={pending}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium text-brand-deep hover:underline disabled:opacity-60",
          className,
        )}
      >
        <PenLine className="h-3.5 w-3.5" strokeWidth={2} />
        {pending ? "Drafting…" : label}
      </button>
      {error && <span className="ml-2 text-xs text-[#b42318]">{error}</span>}
      {draft && <DraftReviewModal draft={draft} onClose={() => setDraft(null)} />}
    </>
  );
}
