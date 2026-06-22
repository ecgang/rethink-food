import Link from "next/link";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { getPartnersExplorer } from "@/lib/partners";

export const dynamic = "force-dynamic";

const TYPE_TABS = [
  { key: "", label: "All" },
  { key: "kitchen", label: "Kitchens" },
  { key: "restaurant", label: "Restaurants" },
  { key: "cbo", label: "CBOs" },
] as const;

type TypeKey = "" | "kitchen" | "restaurant" | "cbo";

function partnerHref(type: "kitchen" | "restaurant" | "cbo", id: string): string {
  if (type === "kitchen") return `/kitchens/${id}`;
  if (type === "restaurant") return `/partners/restaurant/${id}`;
  return `/partners/cbo/${id}`;
}

const TYPE_LABELS: Record<"kitchen" | "restaurant" | "cbo", string> = {
  kitchen: "Kitchen",
  restaurant: "Restaurant",
  cbo: "CBO",
};

const TYPE_BADGE_CLASSES: Record<"kitchen" | "restaurant" | "cbo", string> = {
  kitchen: "bg-[var(--sev-low-bg)] text-[var(--sev-low)]",
  restaurant: "bg-[var(--sev-medium-bg)] text-[var(--sev-medium)]",
  cbo: "bg-black/[0.06] text-foreground/70",
};

export default async function PartnersDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; certified?: string }>;
}) {
  const sp = await searchParams;

  const rawType = sp.type ?? "";
  const activeType: TypeKey =
    rawType === "kitchen" || rawType === "restaurant" || rawType === "cbo" ? rawType : "";

  const q = sp.q?.trim() || undefined;

  // "Certified only" only applies to restaurants — when the toggle is active we
  // also implicitly constrain to type=restaurant so the filter reads sensibly.
  // The lib enforces this too (certified filter is a no-op on kitchens/cbos at
  // the DB level), but we also force type=restaurant in the URL so the type chip
  // reflects the effective scope.
  const certifiedActive = sp.certified === "true";
  const effectiveType: TypeKey = certifiedActive ? "restaurant" : activeType;

  const result = await getPartnersExplorer({
    type: effectiveType || undefined,
    q,
    certified: certifiedActive ? true : undefined,
  });

  // Build base params for filter link construction (exclude keys we're toggling)
  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (effectiveType) baseParams.type = effectiveType;
  if (certifiedActive) baseParams.certified = "true";

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1300px]">
      <PageHeader
        title="Partner directory"
        subtitle="All kitchens, restaurants, and community-based organisations in the network."
      />

      {/* Type filter chips */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TYPE_TABS.map((t) => {
          const isChipActive = effectiveType === t.key && !certifiedActive;
          const chipParams: Record<string, string> = {};
          if (q) chipParams.q = q;
          if (t.key) chipParams.type = t.key;
          const chipStr = new URLSearchParams(chipParams).toString();
          const chipHref = `/partners${chipStr ? `?${chipStr}` : ""}`;
          return (
            <Link
              key={t.key || "all"}
              href={chipHref}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isChipActive
                  ? "bg-brand text-brand-ink"
                  : "bg-black/[0.04] text-foreground/70 hover:bg-black/[0.07]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Search + certified toggle row */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form method="GET" action="/partners" className="flex items-center gap-2">
          {effectiveType && <input type="hidden" name="type" value={effectiveType} />}
          {certifiedActive && <input type="hidden" name="certified" value="true" />}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by name…"
            className="h-8 rounded-lg border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-deep w-56"
          />
          <button
            type="submit"
            className="h-8 rounded-lg bg-brand px-3 text-xs font-semibold text-brand-ink hover:opacity-90 transition-opacity"
          >
            Search
          </button>
        </form>

        {/* Certified-only toggle — only meaningful for restaurants; activating it
            forces type=restaurant so the type chips stay coherent */}
        {(() => {
          const certToggleParams: Record<string, string> = {};
          if (q) certToggleParams.q = q;
          if (certifiedActive) {
            // Turning off: restore previous type if there was one
            if (activeType && activeType !== "restaurant")
              certToggleParams.type = activeType;
          } else {
            // Turning on: lock to restaurant
            certToggleParams.type = "restaurant";
            certToggleParams.certified = "true";
          }
          const certStr = new URLSearchParams(certToggleParams).toString();
          const certHref = `/partners${certStr ? `?${certStr}` : ""}`;
          return (
            <Link
              href={certHref}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                certifiedActive
                  ? "bg-brand text-brand-ink"
                  : "bg-black/[0.04] text-foreground/70 hover:bg-black/[0.07]"
              }`}
            >
              Certified only
            </Link>
          );
        })()}
      </div>

      <p className="mb-2 text-xs text-muted">
        {result.total} {result.total === 1 ? "partner" : "partners"}
        {result.capped && " · showing the first 200 — refine filters to narrow"}
      </p>

      <Card>
        <CardHeader title="Partners" subtitle="Click a name to open the detail page" />
        {result.rows.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted">
            No partners match these filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-black/[0.02] text-xs text-muted">
                <tr>
                  <th className="text-left font-medium px-5 py-2">Name</th>
                  <th className="text-left font-medium px-5 py-2">Type</th>
                  <th className="text-left font-medium px-5 py-2">Market</th>
                  <th className="text-right font-medium px-5 py-2">Capacity / wk</th>
                  <th className="text-left font-medium px-5 py-2">Certified</th>
                  <th className="text-right font-medium px-5 py-2">Meals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-black/[0.02]">
                    <td className="px-5 py-2">
                      <Link
                        href={partnerHref(r.type, r.id)}
                        className="text-brand-deep hover:underline"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-5 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${TYPE_BADGE_CLASSES[r.type]}`}
                      >
                        {TYPE_LABELS[r.type]}
                      </span>
                    </td>
                    <td className="px-5 py-2 text-muted">
                      <Link
                        href={`/markets/${r.marketSlug}`}
                        className="hover:underline hover:text-foreground transition-colors"
                      >
                        {r.marketLabel}
                      </Link>
                    </td>
                    <td className="px-5 py-2 text-right tnum">
                      {r.weeklyCapacity ?? "—"}
                    </td>
                    <td className="px-5 py-2">
                      {r.type === "restaurant" ? (
                        r.certified ? (
                          <span className="inline-flex items-center rounded-full bg-[var(--sev-low-bg)] text-[var(--sev-low)] px-2 py-0.5 text-[11px] font-medium">
                            ✓ Certified
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-2 text-right tnum">{r.mealCount}</td>
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
