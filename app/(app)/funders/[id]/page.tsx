import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardBody, PageHeader } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { formatUsd, formatUsdCompact, formatPct, formatCount } from "@/lib/money";
import { getFunderImpact } from "@/lib/funders";

export const dynamic = "force-dynamic";

export default async function FunderImpactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const impact = await getFunderImpact(id);
  if (!impact) notFound();

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1100px]">
      <Link href="/funders" className="text-xs text-muted hover:underline">
        ← Funders
      </Link>
      <div className="mt-2">
        <PageHeader
          title={impact.name}
          subtitle={`What your support made possible · ${impact.kind}`}
        />
      </div>

      {/* Row 1: Delivery impact */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard
          label="Meals served"
          value={formatCount(impact.mealsServed)}
        />
        <StatCard
          label="Dollars delivered"
          value={formatUsdCompact(impact.dollarsDeliveredCents)}
        />
        <StatCard
          label="People served"
          value={formatCount(impact.peopleServed)}
        />
        <StatCard
          label="Neighborhoods reached"
          value={formatCount(impact.neighborhoodsReached)}
        />
      </div>

      {/* Row 2: Network + financials */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard
          label="Contribution margin"
          value={formatUsdCompact(impact.contributionMarginCents)}
          tone={impact.contributionMarginCents >= 0 ? "pos" : "neg"}
        />
        <StatCard
          label="CBO network"
          value={formatCount(impact.cboNetwork)}
          sub="community orgs"
        />
        <StatCard
          label="Certified restaurants"
          value={formatCount(impact.certifiedRestaurants)}
        />
        <StatCard
          label="Budget utilization"
          value={formatPct(impact.budgetUtilizationPct)}
          sub={`of ${formatUsd(impact.budgetCents)} budget`}
        />
      </div>

      {/* Contracts breakdown */}
      <Card>
        <CardHeader
          title="Contracts breakdown"
          subtitle="Per-contract delivery and budget detail"
        />
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
          <a
            href={`/api/funders/${id}/export`}
            className="inline-flex items-center rounded-md bg-brand-deep px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
          >
            Export CSV
          </a>
        </div>
        {impact.contracts.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">No contracts on record.</p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-black/[0.02] text-xs text-muted">
                <tr>
                  <th className="text-left font-medium px-5 py-2">Contract</th>
                  <th className="text-left font-medium px-5 py-2">Program</th>
                  <th className="text-right font-medium px-5 py-2">Meals served</th>
                  <th className="text-right font-medium px-5 py-2">$ delivered</th>
                  <th className="text-right font-medium px-5 py-2">Budget</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {impact.contracts.map((c) => (
                  <tr key={c.contractId} className="hover:bg-black/[0.02]">
                    <td className="px-5 py-2">
                      <Link
                        href={`/contracts/${c.contractId}`}
                        className="text-brand-deep hover:underline"
                      >
                        {c.contractName}
                      </Link>
                    </td>
                    <td className="px-5 py-2 text-muted">{c.programName}</td>
                    <td className="px-5 py-2 text-right tnum">
                      {formatCount(c.mealsServed)}
                    </td>
                    <td className="px-5 py-2 text-right tnum">
                      {formatUsd(c.dollarsDeliveredCents)}
                    </td>
                    <td className="px-5 py-2 text-right tnum">
                      {formatUsd(c.budgetCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
