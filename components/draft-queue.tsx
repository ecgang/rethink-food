"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { DraftReviewModal } from "@/components/draft-follow-up";
import type { DraftDTO } from "@/lib/comms";
import type { DraftCommKind } from "@prisma/client";

const KIND_LABEL: Record<DraftCommKind, string> = {
  INTAKE_CLARIFICATION: "Intake clarification",
  DELIVERY_NUDGE: "Delivery nudge",
  RECONCILIATION_FLAG: "Reconciliation",
  REPORT_NARRATIVE: "Report narrative",
  INCIDENT_NOTICE: "Incident notice",
};

const STATUS_STYLES: Record<DraftDTO["status"], string> = {
  DRAFT: "bg-[#fefbe8] text-[#b58a00]",
  APPROVED: "bg-[#e7f3ec] text-[#1f7a52]",
  DISCARDED: "bg-[#fef3f2] text-[#b42318]",
};

export function DraftQueue({ drafts }: { drafts: DraftDTO[] }) {
  const [active, setActive] = useState<DraftDTO | null>(null);

  if (drafts.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-muted">
        No drafts yet. Generate one from the briefing, an exception, or a report.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {drafts.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
                  {KIND_LABEL[d.kind]}
                </span>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_STYLES[d.status])}>
                  {d.status}
                </span>
              </div>
              <div className="truncate text-sm font-medium">{d.subject}</div>
            </div>
            <button
              type="button"
              onClick={() => setActive(d)}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground/70 hover:border-brand-deep/40 hover:text-foreground"
            >
              {d.status === "DRAFT" ? "Review" : "View"}
            </button>
          </li>
        ))}
      </ul>
      {active && <DraftReviewModal draft={active} onClose={() => setActive(null)} />}
    </>
  );
}
