// Shimmer placeholders for the streamed dashboard sections. Each mirrors the
// shape of the content it stands in for, so the layout doesn't jump when data
// arrives. Used as <Suspense fallback> on the Command Center.

/** Hero stat blocks — rendered on the dark hero band (light shimmer). */
export function HeroStatsSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="shrink-0">
          <div className="h-9 w-28 animate-pulse rounded bg-white/15" />
          <div className="mt-2 h-2.5 w-20 animate-pulse rounded bg-white/10" />
        </div>
      ))}
    </>
  );
}

/** Matches the borderless KPI strip (1/2/4 cols). */
export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-x lg:divide-y-0 divide-border border-y border-border bg-surface">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="px-4 py-5 sm:px-5 sm:py-6">
          <div className="h-2.5 w-24 animate-pulse rounded bg-black/[0.06]" />
          <div className="mt-3 h-8 w-28 animate-pulse rounded bg-black/[0.08]" />
          <div className="mt-3 h-2.5 w-20 animate-pulse rounded bg-black/[0.06]" />
        </div>
      ))}
    </div>
  );
}

/** A plain chart-sized block (funnel / donut / margin bars). */
export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div
      className="w-full animate-pulse rounded bg-black/[0.05]"
      style={{ height }}
      aria-hidden
    />
  );
}

/** Padded chart block for cards that put the chart directly in the body slot. */
export function PaddedChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div className="px-5 pt-4 pb-5">
      <ChartSkeleton height={height} />
    </div>
  );
}

/** A list of exception rows (Act on today). */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border border-t border-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-5 py-3">
          <div className="h-3 w-2/3 animate-pulse rounded bg-black/[0.07]" />
          <div className="mt-2 h-2.5 w-5/6 animate-pulse rounded bg-black/[0.05]" />
        </div>
      ))}
    </div>
  );
}

/** Recent-deliveries thumbnail grid. */
export function DeliveriesSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-border">
          <div className="h-24 w-full animate-pulse bg-black/[0.06]" />
          <div className="px-2 py-1.5">
            <div className="h-2.5 w-16 animate-pulse rounded bg-black/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** MTM strip: four stat blocks + a table block. */
export function MtmSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-surface px-5 py-4">
            <div className="h-2.5 w-20 animate-pulse rounded bg-black/[0.06]" />
            <div className="mt-2 h-6 w-16 animate-pulse rounded bg-black/[0.08]" />
          </div>
        ))}
      </div>
      <div className="h-32 w-full animate-pulse rounded-lg bg-black/[0.04]" />
    </>
  );
}
