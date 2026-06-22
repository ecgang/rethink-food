import { Card, CardHeader, CardBody, Restricted } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { KpiStrip } from "@/components/kpi-strip";
import { HeroBand } from "@/components/hero-band";
import { DimensionTabs } from "@/components/dimension-tabs";
import { DefinitionsPanel } from "@/components/definitions-panel";
import { LifecycleFunnel, CostDonut, MarginBars } from "@/components/charts";
import { ActOnToday } from "@/components/act-on-today";
import Link from "next/link";
import {
  getDashboardData,
  getActOnToday,
  getMtmReporting,
  getKpiDeltas,
  getHeroStats,
  getRecentDeliveries,
  type DimensionKey,
} from "@/lib/queries";
import { formatUsd, formatUsdCompact, formatPct, formatCount } from "@/lib/money";
import { getCurrentRole } from "@/lib/current-role";
import { can } from "@/lib/roles";

// always render against live data
export const dynamic = "force-dynamic";

const VALID_DIMS: DimensionKey[] = [
  "program",
  "kitchen",
  "restaurant",
  "contract",
  "market",
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ by?: string }>;
}) {
  const sp = await searchParams;
  const dim: DimensionKey = VALID_DIMS.includes(sp.by as DimensionKey)
    ? (sp.by as DimensionKey)
    : "program";

  const [data, exceptions, mtm, deltas, role, hero, deliveries] = await Promise.all([
    getDashboardData(dim),
    getActOnToday(),
    getMtmReporting(),
    getKpiDeltas(),
    getCurrentRole(),
    getHeroStats(),
    getRecentDeliveries(6),
  ]);
  const showFin = can(role, "view:financials");

  const funnelData = [
    { stage: "Planned", count: data.funnel.planned },
    { stage: "Produced", count: data.funnel.produced },
    { stage: "Delivered", count: data.funnel.delivered },
    { stage: "Verified", count: data.funnel.verified },
  ];
  const costDonut = (["FOOD", "LABOR", "TRANSPORT", "OVERHEAD"] as const).map(
    (t) => ({ type: t, value: data.costByType[t] }),
  );
  const marginBars = data.marginByDimension.map((g) => ({
    key: g.key,
    marginPerMealCents: g.mealCount ? Math.round(g.marginCents / g.mealCount) : 0,
    mealCount: g.mealCount,
  }));
  const verifyRate = data.funnel.planned
    ? data.funnel.verified / data.funnel.planned
    : 0;
  const marginPerMeal = data.totals.mealCount
    ? Math.round(data.totals.marginCents / data.totals.mealCount)
    : 0;

  return (
    <>
      <HeroBand
        eyebrow="Real-time operating system"
        title="Command Center"
        stats={[
          { value: hero.mealsTracked, label: "Meals tracked", suffix: "+" },
          { value: hero.deliveredThisWeek, label: "Delivered this week" },
          { value: Math.round(hero.verifiedRate * 100), label: "Delivered meals verified", suffix: "%" },
        ]}
      />
      <div className="px-8 py-7 max-w-[1400px]">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-muted max-w-2xl">
            Meal volumes, unit economics, delivery performance, and what to act on today — across
            every program, kitchen, and contract.
          </p>
          <span className="shrink-0 text-xs text-muted">
            Data as of{" "}
            <span className="font-medium text-foreground tnum">
              {new Date().toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </span>
        </div>

        {/* headline KPIs — editorial number blocks */}
        <div className="mb-6">
          <KpiStrip
            items={[
              {
                label: "Billable meals (realized)",
                value: formatCount(data.totals.mealCount),
                sub: `${formatPct(verifyRate)} of planned verified`,
                delta: { pct: deltas.mealsPct, label: "vs prior 7d" },
              },
              {
                label: "Reimbursement revenue",
                value: formatUsdCompact(data.totals.revenueCents),
                tone: "brand",
                locked: !showFin,
              },
              {
                label: "Contribution margin",
                value: formatUsdCompact(data.totals.marginCents),
                sub: `${formatPct(data.totals.marginPct)} blended, all programs`,
                tone: data.totals.marginCents >= 0 ? "pos" : "neg",
                delta: { pct: deltas.marginPct, label: "vs prior 7d" },
                locked: !showFin,
              },
              {
                label: "Margin / meal",
                value: formatUsd(marginPerMeal),
                sub: `${formatUsd(Math.round(data.totals.costCents / Math.max(1, data.totals.mealCount)))} cost / meal`,
                tone: marginPerMeal >= 0 ? "pos" : "neg",
                delta: { pct: deltas.marginPerMealPct, label: "vs prior 7d" },
                locked: !showFin,
              },
            ]}
          />
        </div>

      <div className="mb-6">
        <DefinitionsPanel />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Act on today — spans the most attention */}
        <Card className="lg:col-span-2 lg:row-span-2">
          <CardHeader
            title="Act on today"
            subtitle="Exceptions ranked by severity, each with a recommended action."
            action={
              <span className="rounded-full bg-[#fef3f2] px-2 py-0.5 text-[11px] font-medium text-[var(--sev-critical)]">
                {exceptions.length} open
              </span>
            }
          />
          <ActOnToday items={exceptions} />
        </Card>

        {/* Lifecycle funnel */}
        <Card>
          <CardHeader
            title="Meal lifecycle"
            subtitle="Planned → produced → delivered → verified"
          />
          <CardBody>
            <LifecycleFunnel data={funnelData} />
          </CardBody>
        </Card>

        {/* Cost composition */}
        <Card>
          <CardHeader
            title="Cost composition"
            subtitle="Where each dollar of meal cost goes"
          />
          {showFin ? (
            <CardBody>
              <CostDonut data={costDonut} />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                {costDonut.map((c) => (
                  <span key={c.type} className="tnum">
                    {c.type[0] + c.type.slice(1).toLowerCase()}:{" "}
                    {formatUsdCompact(c.value)}
                  </span>
                ))}
              </div>
            </CardBody>
          ) : (
            <Restricted note="Cost data requires Finance access." />
          )}
        </Card>
      </div>

      {/* Recent deliveries — where field-confirmed deliveries (and proof photos) land */}
      <Card className="mb-6">
        <CardHeader
          title="Recent deliveries"
          subtitle="Field-confirmed deliveries with proof photos — the loop closing in real time."
          action={
            <Link href="/deliveries" className="text-xs font-medium text-brand-deep hover:underline">
              View all →
            </Link>
          }
        />
        <CardBody>
          {deliveries.length === 0 ? (
            <p className="text-sm text-muted">
              No deliveries recorded yet — record one in the Field App.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {deliveries.map((d) => (
                <Link
                  key={d.id}
                  href={`/meals/${d.id}`}
                  className="block overflow-hidden rounded-lg border border-border transition-colors hover:border-brand-deep"
                >
                  {d.deliveryPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={d.deliveryPhotoUrl}
                      alt={`Delivery to ${d.cboName}`}
                      className="h-24 w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-24 w-full place-items-center bg-black/[0.03] text-[10px] text-muted">
                      No photo
                    </div>
                  )}
                  <div className="px-2 py-1.5">
                    <div className="truncate text-xs font-medium">{d.cboName}</div>
                    <div className="mt-0.5 flex items-center justify-between">
                      <span
                        className={`text-[10px] uppercase tracking-wide ${d.status === "VERIFIED" ? "text-brand-deep" : "text-muted"}`}
                      >
                        {d.status === "VERIFIED" ? "Verified" : "Delivered"}
                      </span>
                      {d.deliveredAt && (
                        <span className="text-[10px] text-muted tnum">
                          {new Date(d.deliveredAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Margin by dimension */}
      <Card className="mb-6">
        <CardHeader
          title="Contribution margin per meal"
          subtitle={`Sliced by ${data.dimensionLabel.toLowerCase()} · realized meals only`}
          action={showFin ? <DimensionTabs current={dim} /> : undefined}
        />
        {showFin ? (
          <CardBody>
            <MarginBars data={marginBars} />
          </CardBody>
        ) : (
          <Restricted note="Contribution margin requires Finance access." />
        )}
      </Card>

      {/* MTM reporting strip */}
      <Card>
        <CardHeader
          title="Medically Tailored Meals — program health"
          subtitle="Medicaid 1115 waiver · delivered-vs-prescribed, retention, and Social Care Network attribution · margins are MTM-only (higher than the all-programs blend above)"
        />
        <CardBody>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <StatCard label="Active members" value={formatCount(mtm.activeMembers)} />
            <StatCard
              label="Member retention"
              value={formatPct(mtm.retentionPct)}
              sub={`${mtm.withdrawnMembers} withdrawn`}
            />
            <StatCard
              label="Delivered (7d)"
              value={formatCount(mtm.deliveredLast7)}
              sub={`${formatCount(mtm.prescribedPerWeek)} prescribed / wk`}
            />
            <StatCard
              label="Fulfillment rate"
              value={formatPct(Math.min(1, mtm.fulfillmentPct))}
              tone={mtm.fulfillmentPct >= 0.9 ? "pos" : "neg"}
            />
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-black/[0.02] text-xs text-muted">
                <tr>
                  <th className="text-left font-medium px-4 py-2">
                    Social Care Network
                  </th>
                  <th className="text-right font-medium px-4 py-2">Members</th>
                  <th className="text-right font-medium px-4 py-2">Delivered (7d)</th>
                  {showFin && <th className="text-right font-medium px-4 py-2">Margin</th>}
                  {showFin && <th className="text-right font-medium px-4 py-2">Margin %</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mtm.byScn.map((s) => (
                  <tr key={s.scn}>
                    <td className="px-4 py-2 font-medium">{scnLabel(s.scn)}</td>
                    <td className="px-4 py-2 text-right tnum">
                      {formatCount(s.members)}
                    </td>
                    <td className="px-4 py-2 text-right tnum">
                      {formatCount(s.deliveredLast7)}
                    </td>
                    {showFin && (
                      <td className="px-4 py-2 text-right tnum">
                        {formatUsdCompact(s.marginCents)}
                      </td>
                    )}
                    {showFin && (
                      <td className="px-4 py-2 text-right tnum">
                        {formatPct(s.marginPct)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
      </div>
    </>
  );
}

function scnLabel(scn: string): string {
  switch (scn) {
    case "PHS":
      return "Public Health Solutions";
    case "SOMOS":
      return "SOMOS Community Care";
    case "SIPPS":
      return "Staten Island PPS";
    default:
      return scn;
  }
}
