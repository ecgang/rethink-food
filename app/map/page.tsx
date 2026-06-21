import { PageHeader } from "@/components/ui";
import { MapPanel } from "@/components/map-panel";
import { getDemandMap } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const points = await getDemandMap();
  return (
    <div className="px-8 py-7 max-w-[1400px]">
      <PageHeader
        title="Demand Map"
        subtitle="Where meal demand sits across NYC neighborhoods versus what we're actually fulfilling — the first slice of the Network Marketplace: match funded demand to nearby kitchen and restaurant capacity."
      />
      <MapPanel points={points} />
    </div>
  );
}
