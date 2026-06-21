import { cn } from "@/lib/cn";
import { DeltaPill, type StatDelta } from "@/components/stat-card";

export interface KpiBlock {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "pos" | "neg" | "brand";
  delta?: StatDelta;
}

/**
 * Borderless "editorial number blocks" — the brand's raw-giant-number treatment,
 * not boxed admin cards. Big Archivo Black figures separated by hairline dividers.
 */
export function KpiStrip({ items }: { items: KpiBlock[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border border-y border-border bg-surface">
      {items.map((it) => {
        const tone =
          it.tone === "pos"
            ? "text-[var(--pos)]"
            : it.tone === "neg"
              ? "text-[var(--neg)]"
              : it.tone === "brand"
                ? "text-brand-deep"
                : "text-foreground";
        return (
          <div key={it.label} className="px-5 py-6">
            <div className="text-[0.625rem] uppercase tracking-[0.2em] text-muted">
              {it.label}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={cn(
                  "font-display font-black tracking-tight tnum text-[clamp(2rem,3.2vw,3rem)] leading-none",
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
