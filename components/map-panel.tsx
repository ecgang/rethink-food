"use client";

import dynamic from "next/dynamic";
import { Card } from "@/components/ui";
import type { DemandMapPoint } from "@/lib/queries";

// Leaflet touches `window`, so load the map client-side only.
const DemandMap = dynamic(() => import("@/components/demand-map"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm text-muted">
      Loading map…
    </div>
  ),
});

export function MapPanel({ points }: { points: DemandMapPoint[] }) {
  const ranked = [...points].sort((a, b) => b.unmet - a.unmet);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2 overflow-hidden">
        <div className="h-[560px]">
          <DemandMap points={points} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <h2 className="text-sm font-semibold">Largest unmet demand</h2>
          <p className="text-xs text-muted mt-0.5">
            Neighborhoods where weekly demand most outpaces fulfilled meals.
          </p>
        </div>
        <ul className="divide-y divide-border">
          {ranked.map((p) => {
            const ratio = p.weeklyDemand ? p.fulfilledLast7 / p.weeklyDemand : 0;
            return (
              <li key={`${p.borough}-${p.neighborhood}`} className="px-5 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">{p.neighborhood}</div>
                  <div className="text-xs text-muted tnum">{p.borough}</div>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-black/[0.06]">
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: `${Math.min(100, ratio * 100)}%`,
                      background:
                        ratio >= 0.66 ? "#1f7a52" : ratio >= 0.33 ? "#d9a441" : "#b42318",
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
      </Card>
    </div>
  );
}
