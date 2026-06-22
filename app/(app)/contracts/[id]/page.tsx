import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardBody, Restricted, PageHeader } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { formatUsd, formatUsdCompact, formatPct, formatCount } from "@/lib/money";
import { getContractDetail } from "@/lib/queries";
import { getCurrentRole } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { InvoiceAction } from "./invoice-action";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null): string {
  return d
    ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
}

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [c, role] = await Promise.all([getContractDetail(id), getCurrentRole()]);
  if (!c) notFound();
  const showFin = can(role, "view:financials");
  const canInvoice = can(role, "invoice:contract");
  const overdue = c.billingDeadline
    ? new Date(c.billingDeadline).getTime() < new Date().getTime()
    : false;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1100px]">
      <Link href="/" className="text-xs text-muted hover:underline">
        ← Command Center
      </Link>
      <div className="mt-2">
        <PageHeader
          title={c.name}
          subtitle={`${c.funderName} (${c.funderKind}) · ${c.programName}${
            c.scnPartner ? ` · ${c.scnPartner}` : ""
          }`}
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="Meals" value={formatCount(c.mealCount)} />
        <StatCard label="Realized" value={formatCount(c.realizedCount)} sub={`${formatCount(c.verifiedCount)} verified`} />
        {showFin ? (
          <>
            <StatCard label="Budget" value={formatUsdCompact(c.budgetCents)} />
            <StatCard
              label="Contribution margin"
              value={formatUsdCompact(c.marginCents)}
              sub={`${formatPct(c.marginPct)} margin`}
              tone={c.marginCents >= 0 ? "pos" : "neg"}
            />
          </>
        ) : (
          <div className="lg:col-span-2">
            <Restricted note="Budget and margin require Finance access." />
          </div>
        )}
      </div>

      {/* Billing + invoice action */}
      <Card className="mb-4">
        <CardHeader
          title="Billing"
          subtitle="Generate the reimbursement invoice for verified meals — closes the contract loop."
        />
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-6">
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Billing deadline</dt>
                <dd className={`mt-0.5 font-medium tnum ${overdue ? "text-[var(--sev-critical)]" : ""}`}>
                  {fmtDate(c.billingDeadline)}
                  {overdue ? " · overdue" : ""}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted">Last invoiced</dt>
                <dd className="mt-0.5 font-medium tnum">{c.lastInvoicedAt ? fmtDate(c.lastInvoicedAt) : "Never"}</dd>
              </div>
            </dl>
            <InvoiceAction
              contractId={c.id}
              uninvoicedCount={c.uninvoicedVerifiedCount}
              uninvoicedAmountCents={c.uninvoicedAmountCents}
              canInvoice={canInvoice}
            />
          </div>
        </CardBody>
      </Card>

      {/* Invoices */}
      <Card>
        <CardHeader title="Invoices" subtitle="Submitted reimbursement claims for this contract" />
        {c.invoices.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">No invoices yet.</p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-black/[0.02] text-xs text-muted">
                <tr>
                  <th className="text-left font-medium px-5 py-2">Period</th>
                  <th className="text-right font-medium px-5 py-2">Meals</th>
                  {showFin && <th className="text-right font-medium px-5 py-2">Amount</th>}
                  <th className="text-left font-medium px-5 py-2">Status</th>
                  <th className="text-left font-medium px-5 py-2">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {c.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-5 py-2 tnum">
                      {fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)}
                    </td>
                    <td className="px-5 py-2 text-right tnum">{formatCount(inv.mealCount)}</td>
                    {showFin && (
                      <td className="px-5 py-2 text-right tnum">{formatUsd(inv.amountCents)}</td>
                    )}
                    <td className="px-5 py-2">{inv.status}</td>
                    <td className="px-5 py-2 text-muted">{inv.createdBy}</td>
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
