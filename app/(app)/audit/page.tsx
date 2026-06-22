import Link from "next/link";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { getAuditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const events = await getAuditLog(100);

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1300px]">
      <PageHeader
        title="Audit trail"
        subtitle="Every operator action, attributed and timestamped"
      />

      <Card>
        <CardHeader title="Events" subtitle="Newest first — up to 100 entries" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-black/[0.02] text-xs text-muted">
              <tr>
                <th className="text-left font-medium px-5 py-2">When</th>
                <th className="text-left font-medium px-5 py-2">Who</th>
                <th className="text-left font-medium px-5 py-2">Action</th>
                <th className="text-left font-medium px-5 py-2">Entity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-10 text-center text-sm text-muted"
                  >
                    No operator actions recorded yet.
                  </td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id} className="hover:bg-black/[0.02]">
                    <td className="px-5 py-2 tnum text-muted whitespace-nowrap">
                      {e.at.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}{" "}
                      {e.at.toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-2">{e.actor}</td>
                    <td className="px-5 py-2">{e.action}</td>
                    <td className="px-5 py-2">
                      <Link
                        href={e.href}
                        className="text-brand-deep hover:underline"
                      >
                        {e.entityLabel}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
