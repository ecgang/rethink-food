import { getFieldQueue } from "@/lib/queries";
import { getCurrentRole } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { FieldCard } from "@/components/field/field-card";
import type { FieldItem } from "@/lib/field";

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

  const toDeliver = queue.filter((i) => i.stage === "deliver");
  const toVerify = queue.filter((i) => i.stage === "verify");
  const overdue = queue.filter((i) => i.overdue).length;

  const card = (i: FieldItem) => (
    <FieldCard
      key={i.id}
      id={i.id}
      stage={i.stage}
      programName={i.programName}
      cboName={i.cboName}
      marketLabel={i.marketLabel}
      ageLabel={ageLabel(i.ageHours)}
      overdue={i.overdue}
      deliveryPhotoUrl={i.deliveryPhotoUrl}
      canOperate={canOperate}
    />
  );

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-xl font-extrabold tracking-tight">Today&apos;s runs</h1>
        <p className="mt-1 text-xs text-muted">
          {queue.length} open · {toDeliver.length} to deliver · {toVerify.length} to verify
          {overdue > 0 && (
            <span className="text-[var(--sev-critical)]"> · {overdue} overdue</span>
          )}
        </p>
      </div>

      {queue.length === 0 && (
        <div className="rounded-xl border border-border bg-surface px-4 py-10 text-center">
          <div className="font-display font-bold">All caught up</div>
          <p className="mt-1 text-xs text-muted">
            Every meal is delivered and verified. Nothing to act on.
          </p>
        </div>
      )}

      {toDeliver.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            Deliver
          </h2>
          <div className="flex flex-col gap-3">{toDeliver.map(card)}</div>
        </section>
      )}

      {toVerify.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            Verify
          </h2>
          <div className="flex flex-col gap-3">{toVerify.map(card)}</div>
        </section>
      )}
    </div>
  );
}
