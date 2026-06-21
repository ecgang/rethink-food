import { ArrowRight } from "lucide-react";
import { SeverityBadge } from "@/components/ui";
import type { ExceptionItem } from "@/lib/exceptions";

export function ActOnToday({ items }: { items: ExceptionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="px-5 pb-5 text-sm text-muted">
        Nothing needs attention right now. ✦
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((it, i) => (
        <li key={`${it.reasonCode}-${it.entityId}-${i}`} className="px-5 py-3">
          <div className="flex items-start gap-3">
            <SeverityBadge severity={it.severity} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{it.title}</div>
              <div className="text-xs text-muted mt-0.5">{it.detail}</div>
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-brand">
                <ArrowRight className="h-3.5 w-3.5" />
                <span>{it.recommendedAction}</span>
              </div>
            </div>
            <code className="hidden md:block text-[10px] text-muted/70 mt-1 shrink-0">
              {it.reasonCode}
            </code>
          </div>
        </li>
      ))}
    </ul>
  );
}
