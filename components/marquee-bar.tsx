import { getMarqueeStats } from "@/lib/queries";
import { FACTS } from "@/lib/facts";
import { formatCount, formatUsdCompact } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * Editorial black marquee carrying LIVE operational data — the brand's most
 * kinetic element, repurposed from a static tagline into real signal.
 */
export async function MarqueeBar() {
  // Resilient: if the DB is unavailable (e.g. during build prerender), fall back
  // to brand facts rather than crashing the render.
  let live: string[] = [];
  try {
    const s = await getMarqueeStats();
    live = [
      `${formatCount(s.deliveredThisWeek)} meals delivered this week`,
      `${formatUsdCompact(s.contributionMonthCents)} contribution margin (30d)`,
      `${s.pendingIntake} partner ${s.pendingIntake === 1 ? "request" : "requests"} pending review`,
    ];
  } catch {
    live = [];
  }
  const items = [
    ...live,
    `${formatCount(FACTS.lifetimeMeals)}+ meals served since 2017`,
    `${FACTS.activeCbos} active community partners`,
    `${FACTS.nycRestaurants}+ Rethink Certified restaurants`,
  ];
  // duplicate the sequence so the -50% translate loops seamlessly
  const sequence = [...items, ...items];

  return (
    <div className="overflow-hidden bg-foreground py-1.5">
      <div className="marquee-track">
        {sequence.map((it, i) => (
          <span
            key={i}
            className="mx-6 text-[11px] uppercase tracking-[0.12em] text-background"
          >
            <span className="text-brand" aria-hidden>
              ●
            </span>{" "}
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}
