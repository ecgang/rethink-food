import Link from "next/link";
import { Card, CardHeader } from "@/components/ui";
import { HeroBand } from "@/components/hero-band";
import { IntakeForm } from "@/components/intake-form";
import { FulfillForm } from "@/components/fulfill-form";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";
import { getCurrentRole } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { getApprovedRequests } from "@/lib/scheduling";
import { eligibleProducers, getMatchOptions } from "@/lib/partners";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  APPROVED: "bg-[#e7f3ec] text-[#1f7a52]",
  FULFILLED: "bg-[#e8f0fd] text-[#2563eb]",
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
  const [history, role, approvedRequests] = await Promise.all([
    prisma.intakeRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        status: true,
        extractedFields: true,
        rawInput: true,
        modelUsed: true,
        approvedBy: true,
        createdAt: true,
        _count: { select: { meals: true } },
      },
    }),
    getCurrentRole(),
    getApprovedRequests(),
  ]);
  const canApprove = can(role, "approve:intake");
  const canMatch = can(role, "match:supply");

  // For each approved request, fetch full producer + contract lists for its market.
  // Deduplicate by marketId to avoid redundant DB calls.
  const uniqueMarketIds = [...new Set(approvedRequests.map((r) => r.marketId))];
  const [producersByMarketArr, optionsByMarketArr] = await Promise.all([
    Promise.all(uniqueMarketIds.map((id) => eligibleProducers(id).then((p) => ({ id, p })))),
    Promise.all(uniqueMarketIds.map((id) => getMatchOptions(id).then((o) => ({ id, o })))),
  ]);
  const producersByMarket = new Map(producersByMarketArr.map(({ id, p }) => [id, p]));
  const optionsByMarket = new Map(optionsByMarketArr.map(({ id, o }) => [id, o]));

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
          <IntakeForm canApprove={canApprove} />
        </div>

        {/* ── Ready to schedule ── */}
        {approvedRequests.length > 0 && (
          <div className="mb-6">
            <h2 className="text-base font-semibold mb-3">Ready to schedule</h2>
            <div className="space-y-3">
              {approvedRequests.map((req) => {
                const producers = producersByMarket.get(req.marketId) ?? [];
                const options = optionsByMarket.get(req.marketId);
                const contracts = options?.contracts ?? [];

                return (
                  <Card key={req.id}>
                    <div className="px-5 py-4">
                      <div className="flex flex-wrap items-start gap-x-6 gap-y-1 mb-3">
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">CBO</span>
                          <p className="text-sm font-medium">{req.cboName}</p>
                        </div>
                        {req.quantity !== null && (
                          <div>
                            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Qty</span>
                            <p className="text-sm">{req.quantity} meals</p>
                          </div>
                        )}
                        {req.deliveryDate && (
                          <div>
                            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Delivery</span>
                            <p className="text-sm">{req.deliveryDate}</p>
                          </div>
                        )}
                        {req.approvedBy && (
                          <div>
                            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Approved by</span>
                            <p className="text-sm text-muted">{req.approvedBy}</p>
                          </div>
                        )}
                      </div>

                      {canMatch ? (
                        <FulfillForm
                          requestId={req.id}
                          suggestedProducerId={req.suggestion.producer?.id ?? null}
                          suggestedContractId={req.suggestion.contract?.id ?? null}
                          defaultQuantity={req.quantity}
                          producers={producers}
                          contracts={contracts}
                        />
                      ) : (
                        <p className="text-xs text-muted italic">
                          Your role cannot schedule meals. Contact an operator.
                        </p>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

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
                  <th className="px-5 py-2 text-left font-medium">Meals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-6 text-center text-muted">
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
                    <td className="px-5 py-3">
                      {r.status === "FULFILLED" && r._count.meals > 0 ? (
                        <Link
                          href={`/meals?intakeRequestId=${r.id}`}
                          className="text-xs text-brand-deep hover:underline tnum"
                        >
                          {r._count.meals} meal{r._count.meals === 1 ? "" : "s"} →
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
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
