import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardBody, Restricted, PageHeader } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { formatCount } from "@/lib/money";
import { getMarketDetail, eligibleProducers, getMatchOptions } from "@/lib/partners";
import { getCurrentRole } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { MatchForm } from "@/components/match-form";

export const dynamic = "force-dynamic";

export default async function MarketDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [market, role] = await Promise.all([
    getMarketDetail(slug),
    getCurrentRole(),
  ]);

  if (!market) notFound();

  const canMatch = can(role, "match:supply");
  const [producers, options] = canMatch
    ? await Promise.all([eligibleProducers(market.id), getMatchOptions(market.id)])
    : [[], { contracts: [], cbos: [] }];

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1100px]">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-muted mb-2">
        <Link href="/map" className="hover:underline">
          ← Demand map
        </Link>
        <span aria-hidden>/</span>
        <Link href="/partners" className="hover:underline">
          Partners
        </Link>
      </nav>

      <div className="mt-2">
        <PageHeader
          title={market.neighborhood}
          subtitle={`${market.borough} · ${market.marketLabel}`}
        />
      </div>

      {/* KPI StatCards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Weekly demand"
          value={formatCount(market.weeklyDemand)}
          sub="meals / week"
        />
        <StatCard
          label="Capacity"
          value={formatCount(market.weeklyCapacity)}
          sub="meals / week"
        />
        <StatCard
          label="Unmet"
          value={formatCount(market.unmet)}
          sub="gap this week"
          tone={market.unmet > 0 ? "neg" : "neutral"}
        />
        <StatCard
          label="Scheduled this week"
          value={formatCount(market.scheduledThisWeek)}
          sub={`of ${formatCount(market.fulfilledLast7)} fulfilled (7d)`}
        />
      </div>

      {/* Served-by section */}
      <Card className="mb-4">
        <CardHeader
          title="Served by"
          subtitle="Kitchens, restaurants, and CBOs operating in this market"
        />
        <CardBody>
          <div className="grid gap-6 sm:grid-cols-3">
            {/* Kitchens */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted mb-2">
                Kitchens
              </h3>
              {market.kitchens.length === 0 ? (
                <p className="text-xs text-muted">None</p>
              ) : (
                <ul className="space-y-1">
                  {market.kitchens.map((k) => (
                    <li key={k.id} className="text-sm">
                      <Link
                        href={`/kitchens/${k.id}`}
                        className="text-brand-deep hover:underline"
                      >
                        {k.name}
                      </Link>
                      <span className="ml-1 text-xs text-muted tnum">
                        ({formatCount(k.weeklyCapacity)} / wk)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Restaurants */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted mb-2">
                Restaurants
              </h3>
              {market.restaurants.length === 0 ? (
                <p className="text-xs text-muted">None</p>
              ) : (
                <ul className="space-y-1">
                  {market.restaurants.map((r) => (
                    <li key={r.id} className="flex items-center gap-1.5 text-sm">
                      <Link
                        href={`/partners/restaurant/${r.id}`}
                        className="text-brand-deep hover:underline"
                      >
                        {r.name}
                      </Link>
                      {r.certified && (
                        <span className="inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-deep uppercase tracking-wide">
                          Certified
                        </span>
                      )}
                      <span className="text-xs text-muted tnum">
                        ({formatCount(r.weeklyCapacity)} / wk)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* CBOs */}
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted mb-2">
                CBOs
              </h3>
              {market.cbos.length === 0 ? (
                <p className="text-xs text-muted">None</p>
              ) : (
                <ul className="space-y-1">
                  {market.cbos.map((c) => (
                    <li key={c.id} className="text-sm">
                      <Link
                        href={`/partners/cbo/${c.id}`}
                        className="text-brand-deep hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.address && (
                        <p className="text-xs text-muted">{c.address}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Recent meals table */}
      <Card className="mb-4">
        <CardHeader
          title="Recent meals"
          subtitle="Latest deliveries and planned meals in this market"
        />
        {market.recentMeals.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">No meals yet.</p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-black/[0.02] text-xs text-muted">
                <tr>
                  <th className="text-left font-medium px-5 py-2">Date</th>
                  <th className="text-left font-medium px-5 py-2">Status</th>
                  <th className="text-left font-medium px-5 py-2">Producer</th>
                  <th className="text-left font-medium px-5 py-2">CBO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {market.recentMeals.map((m) => (
                  <tr key={m.id} className="hover:bg-black/[0.02]">
                    <td className="px-5 py-2 tnum">
                      <Link
                        href={`/meals/${m.id}`}
                        className="text-brand-deep hover:underline"
                      >
                        {new Date(m.mealDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </Link>
                    </td>
                    <td className="px-5 py-2">
                      {m.status[0] + m.status.slice(1).toLowerCase()}
                    </td>
                    <td className="px-5 py-2">{m.producerName}</td>
                    <td className="px-5 py-2">{m.cboName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Match capacity */}
      <Card>
        <CardHeader
          title="Match capacity"
          subtitle="Schedule new meals by wiring a producer to a CBO via an active contract"
        />
        {canMatch ? (
          <CardBody>
            <MatchForm
              marketId={market.id}
              slug={slug}
              producers={producers}
              contracts={options.contracts}
              cbos={options.cbos}
            />
          </CardBody>
        ) : (
          <Restricted note="Scheduling meals requires Operations or Executive access." />
        )}
      </Card>
    </div>
  );
}
