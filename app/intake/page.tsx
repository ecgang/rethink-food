import { Card, CardHeader } from "@/components/ui";
import { HeroBand } from "@/components/hero-band";
import { IntakeForm } from "@/components/intake-form";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  APPROVED: "bg-[#e7f3ec] text-[#1f7a52]",
  REJECTED: "bg-[#fef3f2] text-[#b42318]",
  PENDING: "bg-[#fefbe8] text-[#b58a00]",
};

function summarize(fields: unknown): string {
  if (!fields || typeof fields !== "object") return "—";
  const f = fields as Record<string, unknown>;
  const parts: string[] = [];
  if (f.quantity) parts.push(`${f.quantity} meals`);
  if (f.cbo) parts.push(String(f.cbo));
  if (f.recurrence && f.recurrence !== "ONE_TIME") parts.push(String(f.recurrence).toLowerCase());
  if (Array.isArray(f.dietaryConstraints) && f.dietaryConstraints.length)
    parts.push((f.dietaryConstraints as string[]).join(", "));
  return parts.join(" · ") || "—";
}

export default async function IntakePage() {
  const history = await prisma.intakeRequest.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  return (
    <>
      <HeroBand eyebrow="AI operating layer" title="AI Intake" />
      <div className="px-8 py-7 max-w-[1400px]">
        <p className="text-sm text-muted max-w-2xl mb-6">
          Turn a free-text partner email into a structured, reviewable meal request. The model
          extracts fields with per-field confidence; a human approves before anything is written —
          and every decision is logged.
        </p>

      <div className="mb-6">
        <IntakeForm />
      </div>

      <Card>
        <CardHeader
          title="Intake audit trail"
          subtitle="Every parse + decision is recorded: raw input, extracted fields, model used, and who approved it."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] text-xs text-muted">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Status</th>
                <th className="px-5 py-2 text-left font-medium">Extracted</th>
                <th className="px-5 py-2 text-left font-medium">Raw input</th>
                <th className="px-5 py-2 text-left font-medium">Model</th>
                <th className="px-5 py-2 text-left font-medium">Decided by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-center text-muted">
                    No intake requests yet. Parse and approve one above.
                  </td>
                </tr>
              )}
              {history.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-5 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        STATUS_STYLES[r.status] ?? "bg-black/5",
                      )}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-medium">{summarize(r.extractedFields)}</td>
                  <td className="px-5 py-3 text-muted max-w-md truncate">{r.rawInput}</td>
                  <td className="px-5 py-3">
                    <code className="text-[11px] text-muted">{r.modelUsed ?? "—"}</code>
                  </td>
                  <td className="px-5 py-3 text-muted">{r.approvedBy ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      </div>
    </>
  );
}
