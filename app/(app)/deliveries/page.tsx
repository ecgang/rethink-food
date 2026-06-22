import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getRecentDeliveries } from "@/lib/queries";

export const dynamic = "force-dynamic";

function fmt(d: Date | null): string {
  return d
    ? new Date(d).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
}

export default async function DeliveriesPage() {
  const deliveries = await getRecentDeliveries(24);

  return (
    <div className="px-8 py-7 max-w-[1300px]">
      <PageHeader
        title="Recent deliveries"
        subtitle="Field-confirmed deliveries and verification — with the proof photos captured on the ground."
      />

      {deliveries.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-12 text-center">
          <div className="font-display font-bold">No deliveries yet</div>
          <p className="mt-1 text-xs text-muted">Record one in the Field App to see it here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {deliveries.map((d) => {
            const verified = d.status === "VERIFIED";
            return (
              <Link
                key={d.id}
                href={`/meals/${d.id}`}
                className="block overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-brand-deep"
              >
                {d.deliveryPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.deliveryPhotoUrl}
                    alt={`Delivery to ${d.cboName}`}
                    className="h-44 w-full object-cover"
                  />
                ) : (
                  <div className="grid h-44 w-full place-items-center bg-black/[0.03] text-xs text-muted">
                    No proof photo
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-display font-bold">{d.cboName}</div>
                      <div className="truncate text-xs text-muted">
                        {d.programName} · {d.marketLabel}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        verified
                          ? "bg-brand-soft text-brand-deep"
                          : "bg-[var(--sev-low-bg)] text-[var(--sev-low)]"
                      }`}
                    >
                      {verified ? "Verified" : "Delivered"}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-muted tnum">
                    {fmt(d.deliveredAt)}
                    {d.deliveredBy ? ` · ${d.deliveredBy}` : ""}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
