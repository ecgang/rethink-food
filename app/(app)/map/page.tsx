import { HeroBand, HeroStatsRow } from "@/components/hero-band";
import { MapPanel } from "@/components/map-panel";
import { getDemandMap } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const points = await getDemandMap();
  const totalUnmet = points.reduce((s, p) => s + p.unmet, 0);
  return (
    <>
      <HeroBand eyebrow="Network marketplace" title="Demand Map">
        <HeroStatsRow
          stats={[
            { value: points.length, label: "Neighborhoods" },
            { value: totalUnmet, label: "Unmet meals / week", compact: true },
          ]}
        />
      </HeroBand>
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1400px]">
        <p className="text-sm text-muted max-w-2xl mb-6">
          Where meal demand sits across NYC neighborhoods (weighted by Feeding America food-insecurity
          rates) versus what we&apos;re actually fulfilling — the first slice of the Network
          Marketplace: match funded demand to nearby kitchen and restaurant capacity.
        </p>
        <MapPanel points={points} />
      </div>
    </>
  );
}
