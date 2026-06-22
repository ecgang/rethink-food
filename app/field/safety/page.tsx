import Link from "next/link";
import { getCurrentRole } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { prisma } from "@/lib/db";
import { SafetyForm } from "@/components/field/safety-form";

// always render against live check state
export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  FOOD_SAFETY: "Food Safety",
  QUALITY: "Quality",
};

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 48) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

export default async function SafetyPage() {
  const role = await getCurrentRole();
  const canOperate = can(role, "operate:field");

  const [recentChecks, kitchens] = await Promise.all([
    prisma.safetyCheck.findMany({
      orderBy: { checkedAt: "desc" },
      take: 20,
      include: { kitchen: { select: { name: true } } },
    }),
    prisma.kitchen.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div>
      <div className="mb-1">
        <Link
          href="/field"
          className="text-xs text-muted hover:text-foreground transition-colors"
        >
          ← Today&apos;s runs
        </Link>
      </div>

      <div className="mb-4 mt-2">
        <h1 className="font-display text-xl font-extrabold tracking-tight">
          Food safety &amp; QA
        </h1>
        <p className="mt-1 text-xs text-muted">
          Log a food-safety or quality checklist for a kitchen run.
        </p>
      </div>

      <SafetyForm kitchens={kitchens} canOperate={canOperate} />

      {recentChecks.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            Recent checks
          </h2>
          <div className="flex flex-col gap-2">
            {recentChecks.map((check) => (
              <div
                key={check.id}
                className="rounded-xl border border-border bg-surface p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display font-bold text-sm">
                      {KIND_LABELS[check.kind] ?? check.kind}
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {check.kitchen?.name
                        ? `${check.kitchen.name} · `
                        : ""}
                      {check.temperatureF !== null
                        ? `${check.temperatureF}°F · `
                        : ""}
                      {relativeTime(check.checkedAt)}
                    </div>
                  </div>
                  <span
                    className={
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium " +
                      (check.passed
                        ? "bg-[var(--sev-low-bg)] text-[var(--sev-low)]"
                        : "bg-[var(--sev-critical-bg)] text-[var(--sev-critical)]")
                    }
                  >
                    {check.passed ? "Passed" : "Failed"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {recentChecks.length === 0 && (
        <div className="mt-6 rounded-xl border border-border bg-surface px-4 py-8 text-center">
          <div className="font-display font-bold">No checks yet</div>
          <p className="mt-1 text-xs text-muted">
            Submit the first safety check above.
          </p>
        </div>
      )}
    </div>
  );
}
