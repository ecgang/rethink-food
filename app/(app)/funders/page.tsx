import Link from "next/link";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { getFundersRoster } from "@/lib/funders";
import { formatUsd, formatCount } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function FundersDirectoryPage() {
  const funders = await getFundersRoster();

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1300px]">
      <PageHeader
        title="Funders"
        subtitle="What each funder's support made possible — meals delivered and dollars put to work."
      />

      <Card>
        <CardHeader title="Funders" subtitle="Click a name to open the detail page" />
        {funders.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted">
            No funders found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-black/[0.02] text-xs text-muted">
                <tr>
                  <th className="text-left font-medium px-5 py-2">Funder</th>
                  <th className="text-left font-medium px-5 py-2">Kind</th>
                  <th className="text-right font-medium px-5 py-2">Contracts</th>
                  <th className="text-right font-medium px-5 py-2">Meals served</th>
                  <th className="text-right font-medium px-5 py-2">$ delivered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {funders.map((f) => (
                  <tr key={f.id} className="hover:bg-black/[0.02]">
                    <td className="px-5 py-2">
                      <Link
                        href={`/funders/${f.id}`}
                        className="text-brand-deep hover:underline"
                      >
                        {f.name}
                      </Link>
                    </td>
                    <td className="px-5 py-2">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide bg-black/[0.06] text-foreground/70">
                        {f.kind}
                      </span>
                    </td>
                    <td className="px-5 py-2 text-right tnum">{formatCount(f.contractCount)}</td>
                    <td className="px-5 py-2 text-right tnum">{formatCount(f.mealsServed)}</td>
                    <td className="px-5 py-2 text-right tnum">
                      {formatUsd(f.dollarsDeliveredCents, { maximumFractionDigits: 0 })}
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
