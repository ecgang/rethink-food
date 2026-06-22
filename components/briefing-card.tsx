import Link from "next/link";
import { Card, CardHeader, CardBody, SeverityBadge } from "@/components/ui";
import { RegenerateBriefingButton } from "@/components/regenerate-briefing-button";
import { DraftFollowUpButton } from "@/components/draft-follow-up";
import type { BriefingBoard } from "@/lib/briefing-board";
import type { ExceptionItem } from "@/lib/exceptions";
import type { DraftCommKind } from "@prisma/client";

function entityHref(type: ExceptionItem["entityType"], id: string): string | undefined {
  switch (type) {
    case "Meal": return `/meals/${id}`;
    case "Kitchen": return `/kitchens/${id}`;
    case "Contract": return `/contracts/${id}`;
    case "Member": return undefined; // no standalone member detail page
  }
}

// Which exceptions can spawn a drafted follow-up, and of what kind.
function draftKindFor(type: ExceptionItem["entityType"]): DraftCommKind | null {
  switch (type) {
    case "Meal": return "DELIVERY_NUDGE";
    case "Contract": return "RECONCILIATION_FLAG";
    default: return null;
  }
}

export function BriefingCard({ board }: { board: BriefingBoard }) {
  const { briefing, missingInfo } = board;
  const when = new Date(briefing.generatedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Card className="border-brand-deep/30 bg-brand-soft/30">
      <CardHeader
        title="Today's briefing"
        subtitle="AI-narrated from the deterministic exception engine — explanations only; the engine owns the severities and the math."
        action={<RegenerateBriefingButton />}
      />
      <CardBody>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] font-medium text-muted">
            AI-assisted · human-reviewable · {briefing.modelUsed}
          </span>
          <span className="text-[11px] text-muted">Generated {when}</span>
        </div>

        <p className="text-sm leading-relaxed text-foreground">{briefing.summary}</p>

        {briefing.prioritized.length > 0 && (
          <ul className="mt-4 space-y-3">
            {briefing.prioritized.map((item) => {
              const href = entityHref(item.entityType, item.entityId);
              const draftKind = draftKindFor(item.entityType);
              return (
                <li key={`${item.reasonCode}:${item.entityId}`} className="flex gap-3">
                  <span className="mt-0.5 w-20 shrink-0">
                    <SeverityBadge severity={item.severity} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{item.why}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      <span className="font-medium text-foreground/80">Next:</span> {item.suggestedAction}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      {href && (
                        <Link href={href} className="text-xs font-medium text-brand-deep hover:underline">
                          View {item.entityType.toLowerCase()} →
                        </Link>
                      )}
                      {draftKind && <DraftFollowUpButton kind={draftKind} entityId={item.entityId} />}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {missingInfo.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
              Pending intake needing info ({missingInfo.length})
            </div>
            <ul className="mt-2 space-y-1.5">
              {missingInfo.slice(0, 5).map((m) => (
                <li key={m.intakeId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{m.cboName ?? "Unnamed request"}</span>
                    <span className="text-muted"> — missing {m.missingFields.join(", ")}</span>
                  </span>
                  <span className="shrink-0">
                    <DraftFollowUpButton kind="INTAKE_CLARIFICATION" entityId={m.intakeId} label="Draft email" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
