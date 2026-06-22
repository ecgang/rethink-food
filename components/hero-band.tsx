"use client";

import { useCountUp } from "@/components/use-count-up";

export interface HeroStat {
  value: number;
  label: string;
  suffix?: string;
  /** compact large numbers, e.g. 30000000 -> "30M" */
  compact?: boolean;
}

function StatNumber({ value, label, suffix, compact }: HeroStat) {
  const n = useCountUp(value);
  const text = compact
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 0 }).format(n)
    : new Intl.NumberFormat("en-US").format(n);
  return (
    <div className="shrink-0">
      <div className="font-display font-black leading-none tracking-tight text-brand text-[clamp(1.75rem,3.5vw,2.75rem)] tnum">
        {text}
        {suffix}
      </div>
      <div className="mt-1 text-[0.625rem] uppercase tracking-[0.18em] text-white/70">
        {label}
      </div>
    </div>
  );
}

/** The row of giant green mission numbers — animates a count-up on mount. */
export function HeroStatsRow({ stats }: { stats: HeroStat[] }) {
  return (
    <>
      {stats.map((s) => (
        <StatNumber key={s.label} {...s} />
      ))}
    </>
  );
}

/**
 * Full-bleed black editorial band: oversized title + a slot for the giant green
 * mission numbers. The stats are passed as `children` so they can stream in
 * behind a skeleton via <Suspense>.
 */
export function HeroBand({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-foreground text-background">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6 px-5 py-7 sm:px-8 sm:py-9">
        <div>
          <div className="text-[0.7rem] uppercase tracking-[0.22em] text-brand font-semibold">
            {eyebrow}
          </div>
          <h1 className="mt-2 font-display font-black uppercase leading-[0.95] tracking-tight text-[clamp(2.25rem,5vw,3.75rem)]">
            {title}
          </h1>
        </div>
        {children && (
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">{children}</div>
        )}
      </div>
    </div>
  );
}
