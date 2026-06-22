import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SeverityBadge } from "@/components/ui";
import type { ExceptionItem, Severity } from "@/lib/exceptions";

/** Where an exception drills into — null for entities without a detail page. */
function hrefFor(it: ExceptionItem): string | null {
  switch (it.entityType) {
    case "Meal":
      return `/meals/${it.entityId}`;
    case "Contract":
      return `/contracts/${it.entityId}`;
    case "Kitchen":
      return `/kitchens/${it.entityId}`;
    case "Incident":
      return `/field/incidents`;
    case "SafetyCheck":
      return `/field/safety`;
    default:
      return null;
  }
}

const SEVERITY_ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const SUMMARY_COLOR: Record<Severity, string> = {
  CRITICAL: "text-[var(--sev-critical)]",
  HIGH: "text-[var(--sev-high)]",
  MEDIUM: "text-[var(--sev-medium)]",
  LOW: "text-[var(--sev-low)]",
};
const BORDER_COLOR: Record<Severity, string> = {
  CRITICAL: "border-l-[color:var(--sev-critical)]",
  HIGH: "border-l-[color:var(--sev-high)]",
  MEDIUM: "border-l-[color:var(--sev-medium)]",
  LOW: "border-l-[color:var(--sev-low)]",
};

export function ActOnToday({
  items,
  limit = 12,
}: {
  items: ExceptionItem[];
  limit?: number;
}) {
  if (items.length === 0) {
    return (
      <div className="px-5 pb-5 text-sm text-muted">
        Nothing needs attention right now. ✦
      </div>
    );
  }

  const counts = SEVERITY_ORDER.map((sev) => ({
    sev,
    n: items.filter((i) => i.severity === sev).length,
  })).filter((c) => c.n > 0);

  const shown = items.slice(0, limit);
  const remaining = items.length - shown.length;

  return (
    <>
      {/* severity summary — the "at a glance" line */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-3 text-xs">
        {counts.map((c) => (
          <span key={c.sev} className={SUMMARY_COLOR[c.sev]}>
            <span className="font-semibold tnum">{c.n}</span>{" "}
            {c.sev.toLowerCase()}
          </span>
        ))}
      </div>
      <ul className="divide-y divide-border border-t border-border">
        {shown.map((it, i) => {
          const href = hrefFor(it);
          const inner = (
            <div className="flex items-start gap-3">
              <span className="w-20 shrink-0">
                <SeverityBadge severity={it.severity} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{it.title}</div>
                <div className="text-xs text-muted mt-0.5">{it.detail}</div>
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-brand-deep">
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                  <span>{it.recommendedAction}</span>
                </div>
              </div>
              <code className="hidden md:block text-[10px] text-muted/70 mt-1 shrink-0">
                {it.reasonCode}
              </code>
            </div>
          );
          return (
            <li
              key={`${it.reasonCode}-${it.entityId}-${i}`}
              className={`border-l-[3px] ${BORDER_COLOR[it.severity]}`}
            >
              {href ? (
                <Link
                  href={href}
                  className="block px-5 py-3 outline-none transition-colors hover:bg-black/[0.02] focus-visible:bg-black/[0.03]"
                >
                  {inner}
                </Link>
              ) : (
                <div className="px-5 py-3">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
      {remaining > 0 && (
        <div className="px-5 py-3 text-xs text-muted border-t border-border">
          + {remaining} more lower-priority {remaining === 1 ? "item" : "items"}
        </div>
      )}
    </>
  );
}
