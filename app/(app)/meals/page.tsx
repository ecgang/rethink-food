import Link from "next/link";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { formatUsd, formatCount } from "@/lib/money";
import { getMealsExplorer } from "@/lib/queries";
import { getCurrentRole } from "@/lib/current-role";
import { can } from "@/lib/roles";

export const dynamic = "force-dynamic";

const STATUS_TABS = [
  { key: "", label: "All" },
  { key: "PLANNED", label: "Planned" },
  { key: "PRODUCED", label: "Produced" },
  { key: "DELIVERED", label: "Delivered" },
  { key: "VERIFIED", label: "Verified" },
] as const;

export default async function MealsExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; program?: string; q?: string; kitchenId?: string; contractId?: string; intakeRequestId?: string }>;
}) {
  const sp = await searchParams;
  const [result, role] = await Promise.all([
    getMealsExplorer({
      status: sp.status,
      program: sp.program,
      q: sp.q,
      kitchenId: sp.kitchenId,
      contractId: sp.contractId,
      intakeRequestId: sp.intakeRequestId,
    }),
    getCurrentRole(),
  ]);
  const showFin = can(role, "view:financials");
  const active = sp.status ?? "";

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1300px]">
      <PageHeader title="Meal records" subtitle="Every meal in the system — filter and drill into any one." />

      {/* Provenance banner when filtered to a specific intake request */}
      {sp.intakeRequestId && (
        <div className="mb-4 rounded-lg border border-border bg-black/[0.02] px-4 py-2 text-xs text-muted">
          Showing meals scheduled from intake request{" "}
          <code className="text-[11px]">{sp.intakeRequestId}</code>.{" "}
          <Link href="/meals" className="text-brand-deep hover:underline">
            Clear filter
          </Link>
        </div>
      )}

      {/* status filter */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUS_TABS.map((t) => {
          const isActive = active === t.key;
          const href = t.key ? `/meals?status=${t.key}` : "/meals";
          return (
            <Link
              key={t.key || "all"}
              href={href}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isActive ? "bg-brand text-brand-ink" : "bg-black/[0.04] text-foreground/70 hover:bg-black/[0.07]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <p className="mb-2 text-xs text-muted">
        {formatCount(result.total)} {result.total === 1 ? "meal" : "meals"}
        {result.capped && " · showing the first 200 — refine filters to narrow"}
      </p>

      <Card>
        <CardHeader title="Records" subtitle="Click any row to open the meal" />
        {result.rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted">No meals match these filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-black/[0.02] text-xs text-muted">
                <tr>
                  <th className="text-left font-medium px-5 py-2">Date</th>
                  <th className="text-left font-medium px-5 py-2">Status</th>
                  <th className="text-left font-medium px-5 py-2">Program</th>
                  <th className="text-left font-medium px-5 py-2">Community partner</th>
                  <th className="text-left font-medium px-5 py-2">Market</th>
                  <th className="text-left font-medium px-5 py-2">Producer</th>
                  {showFin && <th className="text-right font-medium px-5 py-2">Margin</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-black/[0.02]">
                    <td className="px-5 py-2 tnum">
                      <Link href={`/meals/${r.id}`} className="text-brand-deep hover:underline">
                        {new Date(r.mealDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </Link>
                    </td>
                    <td className="px-5 py-2">{r.status[0] + r.status.slice(1).toLowerCase()}</td>
                    <td className="px-5 py-2">{r.programName}</td>
                    <td className="px-5 py-2">{r.cboName}</td>
                    <td className="px-5 py-2 text-muted">{r.marketLabel}</td>
                    <td className="px-5 py-2 text-muted">{r.producerName ?? "—"}</td>
                    {showFin && (
                      <td className="px-5 py-2 text-right tnum">
                        {r.realized ? formatUsd(r.marginCents) : "—"}
                      </td>
                    )}
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
