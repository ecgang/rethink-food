"use client";

import dynamic from "next/dynamic";
import type { DemandMapPoint } from "@/lib/queries";

// Leaflet touches `window`, so load the map client-side only.
const DemandMap = dynamic(() => import("@/components/demand-map"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm text-muted">Loading map…</div>
  ),
});

export function MapPanel({ points }: { points: DemandMapPoint[] }) {
  const ranked = [...points].sort((a, b) => b.unmet - a.unmet);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Map pane — fills the remaining height on desktop; fixed-ratio on mobile. */}
      <div
        className="relative h-[55vw] min-h-[280px] overflow-hidden lg:h-auto lg:min-h-0 lg:min-w-0 lg:flex-1"
        role="application"
        aria-label="Map of NYC neighborhood meal demand versus fulfilled capacity. A keyboard-accessible ranked list of the same data is shown alongside."
      >
        <DemandMap points={points} />
      </div>

      {/* Ranked list rail — scrolls independently on desktop; flows below the map on mobile. */}
      <aside
        className="w-full shrink-0 overflow-y-auto border-t border-border bg-surface lg:w-72 lg:border-l lg:border-t-0 xl:w-80"
        aria-label="Neighborhoods ranked by unmet weekly meal demand (text equivalent of the map)"
      >
        <div className="sticky top-0 z-10 border-b border-border bg-surface px-5 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em]">Largest unmet demand</h2>
          <p className="mt-0.5 text-[11px] text-muted">
            Where weekly demand most outpaces fulfilled meals.
          </p>
        </div>
        <ul className="divide-y divide-border">
          {ranked.map((p) => {
            const ratio = p.weeklyDemand ? p.fulfilledLast7 / p.weeklyDemand : 0;
            return (
              <li key={`${p.borough}-${p.neighborhood}`} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{p.neighborhood}</div>
                  <div className="text-xs text-muted tnum">{p.borough}</div>
                </div>
                <div className="mt-1 h-1.5 w-full bg-black/[0.06]">
                  <div
                    className="h-1.5"
                    style={{
                      width: `${Math.min(100, ratio * 100)}%`,
                      background:
                        ratio >= 0.66 ? "#2fae66" : ratio >= 0.33 ? "#d9a441" : "#b42318",
                    }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted tnum">
                  <span>{Math.round(ratio * 100)}% fulfilled</span>
                  <span>{p.unmet.toLocaleString()} unmet / wk</span>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
