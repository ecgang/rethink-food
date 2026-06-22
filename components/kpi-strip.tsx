import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { DeltaPill, type StatDelta } from "@/components/stat-card";

export interface KpiBlock {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "pos" | "neg" | "brand";
  delta?: StatDelta;
  /** redact the value behind a role gate */
  locked?: boolean;
}

/**
 * Borderless "editorial number blocks" — the brand's raw-giant-number treatment,
 * not boxed admin cards. Big Archivo Black figures separated by hairline dividers.
 */
export function KpiStrip({ items }: { items: KpiBlock[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-x lg:divide-y-0 divide-border border-y border-border bg-surface">
      {items.map((it) => {
        const tone =
          it.tone === "pos"
            ? "text-[var(--pos)]"
            : it.tone === "neg"
              ? "text-[var(--neg)]"
              : it.tone === "brand"
                ? "text-brand-deep"
                : "text-foreground";
        if (it.locked) {
          return (
            <div key={it.label} className="px-4 py-5 sm:px-5 sm:py-6">
              <div className="text-[0.625rem] uppercase tracking-[0.2em] text-muted">
                {it.label}
              </div>
              <div className="mt-2 font-display font-black tracking-tight text-[clamp(1.5rem,7vw,2.75rem)] leading-none text-muted/50">
                •••
              </div>
              <div className="mt-2 flex items-center gap-1 text-xs text-muted">
                <Lock className="h-3 w-3" /> Finance access
              </div>
            </div>
          );
        }
        return (
          <div key={it.label} className="px-4 py-5 sm:px-5 sm:py-6">
            <div className="text-[0.625rem] uppercase tracking-[0.2em] text-muted">
              {it.label}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span
                className={cn(
                  "font-display font-black tracking-tight tnum text-[clamp(1.5rem,7vw,2.75rem)] leading-none",
                  tone,
                )}
              >
                {it.value}
              </span>
              {it.delta && <DeltaPill delta={it.delta} />}
            </div>
            {it.sub && <div className="mt-2 text-xs text-muted tnum">{it.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}
