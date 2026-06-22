"use client";

import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useRouter } from "next/navigation";
import type { DemandMapPoint } from "@/lib/queries";

function fulfillmentColor(ratio: number): string {
  if (ratio >= 0.66) return "#2fae66"; // well served (slightly deeper than brand for marker legibility)
  if (ratio >= 0.33) return "#d9a441"; // partial
  return "#b42318"; // largely unmet
}

export default function DemandMap({ points }: { points: DemandMapPoint[] }) {
  const router = useRouter();
  const maxDemand = Math.max(1, ...points.map((p) => p.weeklyDemand));

  return (
    <MapContainer
      center={[40.722, -73.93]}
      zoom={11}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      {points.map((p) => {
        const ratio = p.weeklyDemand ? p.fulfilledLast7 / p.weeklyDemand : 0;
        const radius = 10 + (p.weeklyDemand / maxDemand) * 22;
        const partnerLabel = [
          p.partners.kitchens > 0 ? `${p.partners.kitchens} kitchen${p.partners.kitchens !== 1 ? "s" : ""}` : null,
          p.partners.restaurants > 0 ? `${p.partners.restaurants} restaurant${p.partners.restaurants !== 1 ? "s" : ""}` : null,
          p.partners.cbos > 0 ? `${p.partners.cbos} CBO${p.partners.cbos !== 1 ? "s" : ""}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <CircleMarker
            key={`${p.borough}-${p.neighborhood}`}
            center={[p.lat, p.lng]}
            radius={radius}
            pathOptions={{
              color: fulfillmentColor(ratio),
              fillColor: fulfillmentColor(ratio),
              fillOpacity: 0.45,
              weight: 1.5,
            }}
            eventHandlers={{ click: () => router.push(`/markets/${p.slug}`) }}
          >
            <Tooltip direction="top" offset={[0, -4]}>
              <div className="text-xs">
                <div className="font-semibold">
                  {p.neighborhood}, {p.borough}
                </div>
                <div>Weekly demand: {p.weeklyDemand.toLocaleString()}</div>
                <div>Fulfilled (7d): {p.fulfilledLast7.toLocaleString()}</div>
                <div>Capacity nearby: {p.weeklyCapacity.toLocaleString()}/wk</div>
                <div className="font-medium">
                  Unmet: {p.unmet.toLocaleString()} ({Math.round((1 - ratio) * 100)}%)
                </div>
              </div>
            </Tooltip>
            <Popup>
              <div className="text-xs min-w-[160px]">
                <div className="font-semibold text-sm mb-1">
                  {p.neighborhood}, {p.borough}
                </div>
                {partnerLabel ? (
                  <div className="text-muted mb-1">{partnerLabel}</div>
                ) : (
                  <div className="text-muted mb-1">No partners listed</div>
                )}
                {p.partners.names.length > 0 && (
                  <ul className="mb-2 space-y-0.5">
                    {p.partners.names.map((name) => (
                      <li key={name} className="truncate">{name}</li>
                    ))}
                  </ul>
                )}
                <button
                  className="mt-1 text-xs font-medium underline underline-offset-2 cursor-pointer"
                  onClick={() => router.push(`/markets/${p.slug}`)}
                >
                  View neighborhood →
                </button>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
