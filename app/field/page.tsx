import Link from "next/link";
import { getFieldQueue } from "@/lib/queries";
import { getCurrentRole } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { FieldCard } from "@/components/field/field-card";
import { productionSummary, type FieldItem } from "@/lib/field";

// always render against live meal state
export const dynamic = "force-dynamic";

function ageLabel(hours: number): string {
  if (hours < 1) return "just now";
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export default async function FieldPage() {
  const [queue, role] = await Promise.all([getFieldQueue(), getCurrentRole()]);
  const canOperate = can(role, "operate:field");

  const toProduce = queue.filter((i) => i.stage === "produce");
  const toDeliver = queue.filter((i) => i.stage === "deliver");
  const toVerify = queue.filter((i) => i.stage === "verify");
  const counts = productionSummary(queue);

  const card = (i: FieldItem) => (
    <FieldCard
      key={i.id}
      id={i.id}
      stage={i.stage}
      programName={i.programName}
      cboName={i.cboName}
      marketLabel={i.marketLabel}
      kitchenName={i.kitchenName}
      ageLabel={ageLabel(i.ageHours)}
      overdue={i.overdue}
      deliveryPhotoUrl={i.deliveryPhotoUrl}
      canOperate={canOperate}
    />
  );

  const section = (title: string, items: FieldItem[]) =>
    items.length > 0 && (
      <section className="mb-6">
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
          {title} · {items.length}
        </h2>
        <div className="flex flex-col gap-3">{items.map(card)}</div>
      </section>
    );

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-xl font-extrabold tracking-tight">Today&apos;s runs</h1>
        <p className="mt-1 text-xs text-muted">
          {counts.total} open · {counts.produce} to produce · {counts.deliver} to deliver ·{" "}
          {counts.verify} to verify
          {counts.overdue > 0 && (
            <span className="text-[var(--sev-critical)]"> · {counts.overdue} overdue</span>
          )}
        </p>
      </div>

      {/* Kitchen & field operations tools beyond the lifecycle queue. */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <Link
          href="/field/safety"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm font-bold active:scale-[0.99]"
        >
          Food safety &amp; QA
          <span className="mt-0.5 block text-[11px] font-normal text-muted">
            Run a kitchen checklist
          </span>
        </Link>
        <Link
          href="/field/incidents"
          className="rounded-xl border border-border bg-surface px-4 py-3 text-sm font-bold active:scale-[0.99]"
        >
          Incidents
          <span className="mt-0.5 block text-[11px] font-normal text-muted">
            Report or resolve an issue
          </span>
        </Link>
      </div>

      {queue.length === 0 && (
        <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center">
          <div className="font-display font-bold">All caught up</div>
          <p className="mt-1 text-xs text-muted">
            Every meal is produced, delivered, and verified. Nothing to act on.
          </p>
        </div>
      )}

      {section("Produce", toProduce)}
      {section("Deliver", toDeliver)}
      {section("Verify", toVerify)}
    </div>
  );
}
