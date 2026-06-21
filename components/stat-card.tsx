import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

export interface StatDelta {
  /** signed fraction, e.g. 0.082 for +8.2% */
  pct: number;
  label: string; // e.g. "vs prior 7d"
  /** when true, a downward movement is good (e.g. cost) and colored positively */
  invert?: boolean;
}

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "pos" | "neg" | "brand";
  delta?: StatDelta;
}) {
  const toneClass =
    tone === "pos"
      ? "text-[var(--pos)]"
      : tone === "neg"
        ? "text-[var(--neg)]"
        : tone === "brand"
          ? "text-brand-deep"
          : "text-foreground";

  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={cn("text-2xl font-display font-extrabold tracking-tight tnum", toneClass)}>
          {value}
        </span>
        {delta && <DeltaPill delta={delta} />}
      </div>
      {sub && <div className="mt-1 text-xs text-muted tnum">{sub}</div>}
    </div>
  );
}

export function DeltaPill({ delta }: { delta: StatDelta }) {
  const flat = Math.abs(delta.pct) < 0.005;
  const up = delta.pct > 0;
  const good = flat ? false : delta.invert ? !up : up;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  const color = flat
    ? "text-muted"
    : good
      ? "text-[var(--pos)]"
      : "text-[var(--neg)]";
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-xs font-medium tnum", color)}
      title={delta.label}
    >
      <Icon className="h-3.5 w-3.5" />
      {flat ? "0%" : `${up ? "+" : ""}${(delta.pct * 100).toFixed(1)}%`}
    </span>
  );
}
