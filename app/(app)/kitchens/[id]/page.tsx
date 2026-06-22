import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardBody, Restricted, PageHeader } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { formatUsd, formatUsdCompact, formatPct, formatCount } from "@/lib/money";
import { getKitchenDetail } from "@/lib/queries";
import { getCurrentRole } from "@/lib/current-role";
import { can } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function KitchenDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [k, role] = await Promise.all([getKitchenDetail(id), getCurrentRole()]);
  if (!k) notFound();
  const showFin = can(role, "view:financials");
  const util = k.weeklyCapacity > 0 ? k.producedThisWeek / k.weeklyCapacity : 0;
  const overage =
    k.foodBudgetPerMealCents > 0
      ? (k.foodCostPerMealCents - k.foodBudgetPerMealCents) / k.foodBudgetPerMealCents
      : 0;
  const overBudget = overage >= 0.2;

  return (
    <div className="px-8 py-7 max-w-[1100px]">
      <Link href="/" className="text-xs text-muted hover:underline">
        ← Command Center
      </Link>
      <div className="mt-2">
        <PageHeader title={k.name} subtitle={k.marketLabel} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Weekly capacity" value={formatCount(k.weeklyCapacity)} />
        <StatCard
          label="Produced (7d)"
          value={formatCount(k.producedThisWeek)}
          sub={`${formatPct(util)} of capacity`}
          tone={util < 0.6 ? "neg" : undefined}
        />
        <StatCard label="Total meals" value={formatCount(k.totalMeals)} sub={`${formatCount(k.realizedCount)} realized`} />
        {showFin ? (
          <StatCard
            label="Contribution margin"
            value={formatUsdCompact(k.marginCents)}
            sub={`${formatPct(k.marginPct)} margin`}
            tone={k.marginCents >= 0 ? "pos" : "neg"}
          />
        ) : (
          <Restricted note="Margin requires Finance access." />
        )}
      </div>

      {/* Food cost posture */}
      <Card className="mb-4">
        <CardHeader title="Food cost" subtitle="Actual cost per meal vs. the budgeted target" />
        <CardBody>
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted">Actual / meal</div>
              <div className="mt-0.5 text-lg font-display font-bold tnum">
                {formatUsd(k.foodCostPerMealCents)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted">Budget / meal</div>
              <div className="mt-0.5 text-lg font-display font-bold tnum">
                {formatUsd(k.foodBudgetPerMealCents)}
              </div>
            </div>
            <div>
              {overBudget ? (
                <span className="rounded-full bg-[var(--sev-high-bg)] px-2.5 py-1 text-xs font-medium text-[var(--sev-high)]">
                  {Math.round(overage * 100)}% over budget
                </span>
              ) : (
                <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-deep">
                  On budget
                </span>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Recent meals */}
      <Card>
        <CardHeader title="Recent meals" subtitle="Latest meals produced by this kitchen" />
        {k.recentMeals.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">No meals yet.</p>
          </CardBody>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black/[0.02] text-xs text-muted">
                <tr>
                  <th className="text-left font-medium px-5 py-2">Date</th>
                  <th className="text-left font-medium px-5 py-2">Status</th>
                  <th className="text-left font-medium px-5 py-2">Community partner</th>
                  {showFin && <th className="text-right font-medium px-5 py-2">Margin</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {k.recentMeals.map((m) => (
                  <tr key={m.id} className="hover:bg-black/[0.02]">
                    <td className="px-5 py-2 tnum">
                      <Link href={`/meals/${m.id}`} className="text-brand-deep hover:underline">
                        {new Date(m.mealDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </Link>
                    </td>
                    <td className="px-5 py-2">{m.status[0] + m.status.slice(1).toLowerCase()}</td>
                    <td className="px-5 py-2">{m.cboName}</td>
                    {showFin && <td className="px-5 py-2 text-right tnum">{formatUsd(m.marginCents)}</td>}
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
