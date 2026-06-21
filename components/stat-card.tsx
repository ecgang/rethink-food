import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "pos" | "neg" | "brand";
}) {
  const toneClass =
    tone === "pos"
      ? "text-[var(--pos)]"
      : tone === "neg"
        ? "text-[var(--neg)]"
        : tone === "brand"
          ? "text-brand"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tnum", toneClass)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted tnum">{sub}</div>}
    </div>
  );
}
