import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, CardBody, PageHeader } from "@/components/ui";
import { StatCard } from "@/components/stat-card";
import { formatCount } from "@/lib/money";
import { getCboDetail } from "@/lib/partners";
import { getCurrentRole } from "@/lib/current-role";

export const dynamic = "force-dynamic";

const STATUS_CLASSES: Record<string, string> = {
  PLANNED: "bg-blue-50 text-blue-700",
  PRODUCED: "bg-amber-50 text-amber-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  VERIFIED: "bg-brand-soft text-brand-deep",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_CLASSES[status] ?? "bg-black/[0.05] text-foreground";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {status[0] + status.slice(1).toLowerCase()}
    </span>
  );
}

export default async function CboDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [c, role] = await Promise.all([getCboDetail(id), getCurrentRole()]);
  if (!c) notFound();
  void role; // reserved for future RBAC gating (match action)

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1100px]">
      <Link href="/partners" className="text-xs text-muted hover:underline">
        ← Partners
      </Link>
      <div className="mt-2">
        <PageHeader
          title={c.name}
          subtitle={c.marketLabel}
        />
        <Link
          href={`/markets/${c.marketSlug}`}
          className="text-xs text-brand-deep hover:underline"
        >
          View neighborhood →
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        <StatCard label="Total meals" value={formatCount(c.mealCount)} />
        <StatCard
          label="Delivered"
          value={formatCount(c.deliveredCount)}
          sub={c.mealCount > 0 ? `${Math.round((c.deliveredCount / c.mealCount) * 100)}% of total` : undefined}
          tone={c.mealCount > 0 && c.deliveredCount / c.mealCount >= 0.7 ? "pos" : undefined}
        />
        <StatCard
          label="Contact email"
          value={c.contactEmail ?? "—"}
        />
      </div>

      {/* Info card */}
      <Card className="mb-4">
        <CardHeader title="Organization info" subtitle="Address and market details" />
        <CardBody>
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted">Address</div>
              <div className="mt-0.5 font-medium">{c.address ?? "—"}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted">Market</div>
              <div className="mt-0.5 font-medium">
                <Link href={`/markets/${c.marketSlug}`} className="text-brand-deep hover:underline">
                  {c.marketLabel}
                </Link>
              </div>
            </div>
            {c.contactEmail && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted">Contact</div>
                <div className="mt-0.5 font-medium">
                  <a href={`mailto:${c.contactEmail}`} className="text-brand-deep hover:underline">
                    {c.contactEmail}
                  </a>
                </div>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Recent meals */}
      <Card>
        <CardHeader title="Recent meals" subtitle="Latest meals received by this organization" />
        {c.recentMeals.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted">No meals yet.</p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-black/[0.02] text-xs text-muted">
                <tr>
                  <th className="text-left font-medium px-5 py-2">Date</th>
                  <th className="text-left font-medium px-5 py-2">Status</th>
                  <th className="text-left font-medium px-5 py-2">Producer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {c.recentMeals.map((m) => (
                  <tr key={m.id} className="hover:bg-black/[0.02]">
                    <td className="px-5 py-2 tnum">
                      <Link href={`/meals/${m.id}`} className="text-brand-deep hover:underline">
                        {new Date(m.mealDate).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </Link>
                    </td>
                    <td className="px-5 py-2">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-5 py-2">{m.producerName ?? "—"}</td>
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
