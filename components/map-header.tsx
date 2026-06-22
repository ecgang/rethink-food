"use client";

import { useCountUp } from "@/components/use-count-up";

function StatChip({ value, label, compact }: { value: number; label: string; compact?: boolean }) {
  const n = useCountUp(value);
  const text = compact
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 0 }).format(n)
    : new Intl.NumberFormat("en-US").format(n);
  return (
    <div className="text-right">
      <div className="font-display text-[1.35rem] font-black leading-none tracking-tight text-brand tnum">
        {text}
      </div>
      <div className="mt-0.5 text-[0.6rem] uppercase tracking-[0.16em] text-white/70">{label}</div>
    </div>
  );
}

/** Compact black brand header for the Demand Map — replaces the full hero band so
 *  the map is above the fold, but keeps the brand band + count-up stats. */
export function MapHeader({ pointCount, totalUnmet }: { pointCount: number; totalUnmet: number }) {
  return (
    <header className="shrink-0 flex flex-wrap items-center justify-between gap-4 bg-foreground px-5 py-3 text-background">
      <div>
        <div className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand">
          Network marketplace
        </div>
        <h1 className="font-display text-lg font-black uppercase leading-none tracking-tight sm:text-xl">
          Demand Map
        </h1>
      </div>
      <div className="flex items-center gap-6">
        <StatChip value={pointCount} label="Neighborhoods" />
        <StatChip value={totalUnmet} label="Unmet meals / wk" compact />
      </div>
    </header>
  );
}
