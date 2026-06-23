import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentRole } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { sortIncidents, openCount } from "@/lib/incidents";
import { IncidentForm } from "@/components/field/incident-form";
import { IncidentRow } from "@/components/field/incident-row";

// always render against live incident state
export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const [role, incidentsRaw, kitchens] = await Promise.all([
    getCurrentRole(),
    prisma.incident.findMany({
      orderBy: { reportedAt: "desc" },
      take: 50,
      include: {
        kitchen: { select: { name: true } },
        market: { select: { borough: true, neighborhood: true } },
      },
    }),
    prisma.kitchen.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const canOperate = can(role, "operate:field");

  // The DB rows are a superset of IncidentItem, so sortIncidents (generic) keeps
  // their full shape — no cast or re-lookup needed.
  const incidents = sortIncidents(incidentsRaw);
  const open = openCount(incidentsRaw);

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight">Incidents</h1>
          <p className="mt-1 text-xs text-muted">
            {open} open · {incidentsRaw.length} total (last 50)
          </p>
        </div>
        <Link
          href="/field"
          className="text-xs text-muted underline-offset-2 hover:underline"
        >
          ← Today&apos;s runs
        </Link>
      </div>

      <div className="mb-6">
        <IncidentForm kitchens={kitchens} canOperate={canOperate} />
      </div>

      {incidents.length === 0 && (
        <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center">
          <div className="font-display font-bold">No incidents</div>
          <p className="mt-1 text-xs text-muted">
            No incidents reported yet. Use the form above to log one.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {incidents.map((incident) => (
          <IncidentRow
            key={incident.id}
            id={incident.id}
            kind={incident.kind}
            severity={incident.severity}
            status={incident.status}
            title={incident.title}
            description={incident.description}
            reportedAt={incident.reportedAt}
            kitchenName={incident.kitchen?.name ?? null}
            photoUrl={incident.photoUrl ?? null}
            resolvedAt={incident.resolvedAt ?? null}
            resolutionNote={incident.resolutionNote ?? null}
            canOperate={canOperate}
          />
        ))}
      </div>
    </div>
  );
}
