import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardBody, Restricted, PageHeader } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { formatUsd, formatPct } from "@/lib/money";
import { getMealDetail } from "@/lib/queries";
import { getCurrentRole } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { MealActions } from "./meal-actions";

export const dynamic = "force-dynamic";

const STATUSES = ["PLANNED", "PRODUCED", "DELIVERED", "VERIFIED"] as const;

function fmt(d: Date | null): string {
  return d
    ? new Date(d).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
}

export default async function MealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [meal, role] = await Promise.all([getMealDetail(id), getCurrentRole()]);
  if (!meal) notFound();
  const showFin = can(role, "view:financials");
  const canOperate = can(role, "operate:field");
  const reached = STATUSES.indexOf(meal.status);

  const steps = [
    { label: "Planned", at: meal.plannedAt, by: null as string | null },
    { label: "Produced", at: meal.producedAt, by: null as string | null },
    { label: "Delivered", at: meal.deliveredAt, by: meal.deliveredBy },
    { label: "Verified", at: meal.verifiedAt, by: meal.verifiedBy },
  ];

  return (
    <div className="px-8 py-7 max-w-[1100px]">
      <Link href="/meals" className="text-xs text-muted hover:underline">
        ← All records
      </Link>
      <div className="mt-2">
        <PageHeader
          title={meal.cboName}
          subtitle={`${meal.programName} · ${meal.marketLabel} · meal date ${new Date(
            meal.mealDate,
          ).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
        >
          <MealActions mealId={meal.id} status={meal.status} canOperate={canOperate} />
        </PageHeader>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Lifecycle timeline */}
        <Card className="lg:col-span-2">
          <CardHeader title="Lifecycle" subtitle="Planned → produced → delivered → verified" />
          <CardBody>
            <ol className="space-y-3">
              {steps.map((s, i) => {
                const done = i <= reached && s.at != null;
                return (
                  <li key={s.label} className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                        done ? "bg-brand text-brand-ink" : "bg-black/[0.06] text-muted"
                      }`}
                    >
                      {done ? "✓" : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-medium ${done ? "" : "text-muted"}`}>
                          {s.label}
                        </span>
                        <span className="text-xs text-muted tnum">{fmt(s.at)}</span>
                      </div>
                      {s.by && <div className="text-[11px] text-muted">by {s.by}</div>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardBody>
        </Card>

        {/* Delivery proof */}
        <Card>
          <CardHeader title="Delivery proof" subtitle="Photo captured in the field" />
          <CardBody>
            {meal.deliveryPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={meal.deliveryPhotoUrl}
                alt={`Delivery to ${meal.cboName}`}
                className="max-h-[320px] w-full rounded-lg object-cover"
              />
            ) : (
              <div className="grid h-40 w-full place-items-center rounded-lg bg-black/[0.03] text-xs text-muted">
                {meal.status === "DELIVERED" || meal.status === "VERIFIED"
                  ? "No proof photo on file"
                  : "Not yet delivered"}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Provenance */}
      <Card className="mt-4">
        <CardHeader title="Provenance" subtitle="Who funds, produces, and receives this meal" />
        <CardBody>
          <dl className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            <Field label="Contract">
              <Link href={`/contracts/${meal.contractId}`} className="text-brand-deep hover:underline">
                {meal.contractName}
              </Link>
            </Field>
            <Field label="Funder">{meal.funderName}</Field>
            <Field label="Program">{meal.programName}</Field>
            <Field label="Producer">
              {meal.kitchenId ? (
                <Link href={`/kitchens/${meal.kitchenId}`} className="text-brand-deep hover:underline">
                  {meal.producerName}
                </Link>
              ) : (
                meal.producerName ?? "—"
              )}
            </Field>
            <Field label="Community partner">{meal.cboName}</Field>
            <Field label="Member ref">{meal.memberRef ?? "—"}</Field>
          </dl>
        </CardBody>
      </Card>

      {/* Economics */}
      <Card className="mt-4">
        <CardHeader title="Unit economics" subtitle="Revenue, cost, and contribution margin for this meal" />
        {showFin ? (
          <CardBody>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <StatCard label="Reimbursement" value={formatUsd(meal.revenueCents)} />
              <StatCard label="Total cost" value={formatUsd(meal.costCents)} />
              <StatCard
                label="Contribution margin"
                value={formatUsd(meal.marginCents)}
                tone={meal.marginCents >= 0 ? "pos" : "neg"}
              />
              <StatCard label="Margin %" value={formatPct(meal.marginPct)} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {(["FOOD", "LABOR", "TRANSPORT", "OVERHEAD"] as const).map((t) => (
                <span key={t} className="tnum">
                  {t[0] + t.slice(1).toLowerCase()}: {formatUsd(meal.costByType[t])}
                </span>
              ))}
            </div>
          </CardBody>
        ) : (
          <Restricted note="Cost and margin require Finance access." />
        )}
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}
