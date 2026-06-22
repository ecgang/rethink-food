import { MapHeader } from "@/components/map-header";
import { MapPanel } from "@/components/map-panel";
import { getDemandMap } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const points = await getDemandMap();
  const totalUnmet = points.reduce((s, p) => s + p.unmet, 0);

  // Desktop: viewport-locked (header + full-height map + scrolling rail).
  // Mobile: normal document flow so the page scrolls inside <main>.
  return (
    <div className="flex flex-col lg:h-full lg:overflow-hidden">
      <MapHeader pointCount={points.length} totalUnmet={totalUnmet} />
      <MapPanel points={points} />
    </div>
  );
}
