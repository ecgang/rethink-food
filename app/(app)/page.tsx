import { Suspense } from "react";
import Link from "next/link";
import { Card, CardHeader, CardBody, Restricted } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { KpiStrip } from "@/components/kpi-strip";
import { HeroBand, HeroStatsRow } from "@/components/hero-band";
import { DimensionTabs } from "@/components/dimension-tabs";
import { DefinitionsPanel } from "@/components/definitions-panel";
import { CostDonut, MarginBars } from "@/components/charts";
import { LifecyclePipeline } from "@/components/lifecycle-pipeline";
import { ActOnToday } from "@/components/act-on-today";
import {
  HeroStatsSkeleton,
  KpiSkeleton,
  ChartSkeleton,
  PaddedChartSkeleton,
  ListSkeleton,
  DeliveriesSkeleton,
  MtmSkeleton,
} from "@/components/skeletons";
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

// Render dynamically; each heavy section streams in behind a skeleton.
export const dynamic = "force-dynamic";

const VALID_DIMS: DimensionKey[] = ["program", "kitchen", "restaurant", "contract", "market"];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ by?: string }>;
}) {
  // Both of these are instant (URL parse + cookie read) — no DB — so the shell
  // and skeletons flush immediately while the data sections stream.
  const [sp, role] = await Promise.all([searchParams, getCurrentRole()]);
  const dim: DimensionKey = VALID_DIMS.includes(sp.by as DimensionKey)
    ? (sp.by as DimensionKey)
    : "program";
  const showFin = can(role, "view:financials");

  return (
    <>
      <HeroBand eyebrow="Real-time operating system" title="Command Center">
        <Suspense fallback={<HeroStatsSkeleton />}>
          <HeroStats />
        </Suspense>
      </HeroBand>

      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1400px]">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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

        {/* headline KPIs */}
        <div className="mb-4">
          <Suspense fallback={<KpiSkeleton />}>
            <KpiSection dim={dim} showFin={showFin} />
          </Suspense>
        </div>

        <div className="mb-4">
          <DefinitionsPanel />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <Card className="lg:col-span-2 lg:row-span-2">
            <CardHeader
              title="Act on today"
              subtitle="Exceptions ranked by severity, each with a recommended action. Tap one to drill in."
            />
            <Suspense fallback={<ListSkeleton />}>
              <ActSection />
            </Suspense>
          </Card>

          <Card>
            <CardHeader title="Meals in flight" subtitle="Where meals are right now — and what's blocking the bill" />
            <CardBody>
              <Suspense fallback={<ChartSkeleton height={200} />}>
                <FunnelSection dim={dim} />
              </Suspense>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Cost composition" subtitle="Where each dollar of meal cost goes" />
            {showFin ? (
              <Suspense fallback={<PaddedChartSkeleton height={200} />}>
                <CostSection dim={dim} />
              </Suspense>
            ) : (
              <Restricted note="Cost data requires Finance access." />
            )}
          </Card>
        </div>

        {/* Recent deliveries — where field-confirmed deliveries (and proof photos) land */}
        <Card className="mb-4">
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
            <Suspense fallback={<DeliveriesSkeleton />}>
              <DeliveriesSection />
            </Suspense>
          </CardBody>
        </Card>

        {/* Margin by dimension */}
        <Card className="mb-4">
          <CardHeader
            title="Contribution margin per meal"
            subtitle={`Sliced by ${dimLabel(dim)} · realized meals only`}
            action={showFin ? <DimensionTabs current={dim} /> : undefined}
          />
          {showFin ? (
            <Suspense fallback={<PaddedChartSkeleton height={220} />}>
              <MarginSection dim={dim} />
            </Suspense>
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
            <Suspense fallback={<MtmSkeleton />}>
              <MtmSection showFin={showFin} />
            </Suspense>
          </CardBody>
        </Card>
      </div>
    </>
  );
}

// ---- Streamed sections (each fetches its own data; loadEconMeals is cache()'d
//      so concurrent sections share a single per-request DB load) -------------

async function HeroStats() {
  const hero = await getHeroStats();
  return (
    <HeroStatsRow
      stats={[
        { value: hero.mealsTracked, label: "Meals tracked", suffix: "+" },
        { value: hero.deliveredThisWeek, label: "Delivered this week" },
        { value: Math.round(hero.verifiedRate * 100), label: "Delivered meals verified", suffix: "%" },
      ]}
    />
  );
}

async function KpiSection({ dim, showFin }: { dim: DimensionKey; showFin: boolean }) {
  const [data, deltas] = await Promise.all([getDashboardData(dim), getKpiDeltas()]);
  const verifyRate = data.funnel.planned ? data.funnel.verified / data.funnel.planned : 0;
  const marginPerMeal = data.totals.mealCount
    ? Math.round(data.totals.marginCents / data.totals.mealCount)
    : 0;
  const costPerMeal = Math.round(data.totals.costCents / Math.max(1, data.totals.mealCount));
  return (
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
          sub: `${formatUsd(costPerMeal)} cost / meal`,
          tone: marginPerMeal >= 0 ? "pos" : "neg",
          delta: { pct: deltas.marginPerMealPct, label: "vs prior 7d" },
          locked: !showFin,
        },
      ]}
    />
  );
}

async function ActSection() {
  const exceptions = await getActOnToday();
  return <ActOnToday items={exceptions} limit={7} />;
}

async function FunnelSection({ dim }: { dim: DimensionKey }) {
  const data = await getDashboardData(dim);
  return <LifecyclePipeline {...data.funnel} />;
}

async function CostSection({ dim }: { dim: DimensionKey }) {
  const data = await getDashboardData(dim);
  const costDonut = (["FOOD", "LABOR", "TRANSPORT", "OVERHEAD"] as const).map((t) => ({
    type: t,
    value: data.costByType[t],
  }));
  return (
    <CardBody>
      <CostDonut data={costDonut} />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {costDonut.map((c) => (
          <span key={c.type} className="tnum">
            {c.type[0] + c.type.slice(1).toLowerCase()}: {formatUsdCompact(c.value)}
          </span>
        ))}
      </div>
    </CardBody>
  );
}

async function DeliveriesSection() {
  const deliveries = await getRecentDeliveries(6);
  if (deliveries.length === 0) {
    return (
      <p className="text-sm text-muted">
        No deliveries recorded yet — record one in the Field App.
      </p>
    );
  }
  return (
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
            <div className="grid h-24 w-full place-items-center bg-brand-soft/60">
              <span aria-hidden className="text-xl text-brand-deep/70">
                ✓
              </span>
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
  );
}

async function MarginSection({ dim }: { dim: DimensionKey }) {
  const data = await getDashboardData(dim);
  const marginBars = data.marginByDimension
    .filter((g) => g.mealCount > 0) // drop empty slices (e.g. a program with no realized meals)
    .map((g) => ({
      key: g.key,
      marginPerMealCents: g.mealCount ? Math.round(g.marginCents / g.mealCount) : 0,
      mealCount: g.mealCount,
    }));
  return (
    <CardBody>
      <MarginBars data={marginBars} />
    </CardBody>
  );
}

async function MtmSection({ showFin }: { showFin: boolean }) {
  const mtm = await getMtmReporting();
  return (
    <>
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
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-black/[0.02] text-xs text-muted">
            <tr>
              <th className="text-left font-medium px-4 py-2">Social Care Network</th>
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
                <td className="px-4 py-2 text-right tnum">{formatCount(s.members)}</td>
                <td className="px-4 py-2 text-right tnum">{formatCount(s.deliveredLast7)}</td>
                {showFin && (
                  <td className="px-4 py-2 text-right tnum">{formatUsdCompact(s.marginCents)}</td>
                )}
                {showFin && (
                  <td className="px-4 py-2 text-right tnum">{formatPct(s.marginPct)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function dimLabel(dim: DimensionKey): string {
  const labels: Record<DimensionKey, string> = {
    program: "program",
    kitchen: "kitchen",
    restaurant: "restaurant partner",
    contract: "contract / funder",
    market: "market",
  };
  return labels[dim];
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
