"use client";

import { useState, useTransition } from "react";
import { Sparkles, Check, X, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardHeader, CardBody } from "@/components/ui";
import { parseAction, approveAction, rejectAction } from "@/app/intake/actions";
import type { IntakeParseResult, Confidence } from "@/lib/intake";

const SAMPLES: { label: string; text: string }[] = [
  {
    label: "Recurring halal request",
    text: "Hi Rethink team — La Jornada in Corona needs 250 halal meals delivered every Wednesday starting next week. A few of our clients are diabetic so lower-sodium where possible. Thank you! — Maria",
  },
  {
    label: "One-time emergency",
    text: "URGENT: BronxWorks shelter on 161st had a pipe burst. Can you get us 120 meals tomorrow? No dietary restrictions. Call me — Devon",
  },
  {
    label: "Vague / low-confidence",
    text: "hey just checking if you can help us out with some meals for our seniors program in brooklyn sometime soon, lmk",
  },
];

const CONF_STYLES: Record<Confidence, string> = {
  high: "bg-[#e7f3ec] text-[#1f7a52]",
  medium: "bg-[#fefbe8] text-[#b58a00]",
  low: "bg-[#fef3f2] text-[#b42318]",
};

function ConfBadge({ level }: { level?: Confidence }) {
  if (!level) return <span className="text-xs text-muted">—</span>;
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium uppercase", CONF_STYLES[level])}>
      {level}
    </span>
  );
}

const FIELD_ORDER: { key: keyof IntakeParseResult["fields"]; label: string }[] = [
  { key: "cbo", label: "CBO" },
  { key: "quantity", label: "Quantity" },
  { key: "deliveryDate", label: "Delivery date" },
  { key: "recurrence", label: "Recurrence" },
  { key: "dietaryConstraints", label: "Dietary" },
  { key: "location", label: "Location" },
  { key: "notes", label: "Notes" },
];

function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  return String(v);
}

export function IntakeForm({ canApprove }: { canApprove: boolean }) {
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<IntakeParseResult | null>(null);
  const [status, setStatus] = useState<null | "approved" | "rejected">(null);
  const [isParsing, startParse] = useTransition();
  const [isDeciding, startDecide] = useTransition();

  function doParse() {
    setStatus(null);
    setResult(null);
    startParse(async () => {
      const r = await parseAction(raw);
      setResult(r);
    });
  }

  function decide(kind: "approve" | "reject") {
    if (!result) return;
    startDecide(async () => {
      const payload = { raw, fields: result.fields, confidence: result.confidence, modelUsed: result.modelUsed };
      if (kind === "approve") await approveAction(payload);
      else await rejectAction(payload);
      setStatus(kind === "approve" ? "approved" : "rejected");
      setResult(null);
      setRaw("");
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left: raw input */}
      <Card>
        <CardHeader
          title="Incoming request"
          subtitle="Paste an email or message from a community partner."
        />
        <CardBody>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                onClick={() => { setRaw(s.text); setResult(null); setStatus(null); }}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground/70 hover:bg-black/[0.04] outline-none focus-visible:ring-2 focus-visible:ring-brand-deep focus-visible:ring-offset-1"
              >
                {s.label}
              </button>
            ))}
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={9}
            placeholder="Paste the partner's message here…"
            className="w-full resize-none rounded-lg border border-border bg-background/40 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-deep/40 focus:border-brand-deep"
          />
          <button
            onClick={doParse}
            disabled={isParsing || !raw.trim()}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-brand-deep focus-visible:ring-offset-2"
          >
            {isParsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {isParsing ? "Parsing…" : "Parse with AI"}
          </button>
        </CardBody>
      </Card>

      {/* Right: extracted review */}
      <Card>
        <CardHeader
          title="Extracted request"
          subtitle="Review and confirm before anything is written to the system."
          action={
            result ? (
              <code className="text-[10px] text-muted">{result.modelUsed}</code>
            ) : undefined
          }
        />
        <CardBody>
          {status && (
            <div
              className={cn(
                "mb-3 rounded-lg px-3 py-2 text-sm",
                status === "approved"
                  ? "bg-[#e7f3ec] text-[#1f7a52]"
                  : "bg-[#fef3f2] text-[#b42318]",
              )}
            >
              {status === "approved"
                ? "Approved and recorded in the intake audit trail."
                : "Rejected — recorded in the audit trail."}
            </div>
          )}

          {!result && !status && (
            <p className="text-sm text-muted">
              Nothing parsed yet. Paste a message and click <b>Parse with AI</b>.
            </p>
          )}

          {result && (
            <div className="reveal" role="status" aria-live="polite">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {FIELD_ORDER.map((f) => (
                    <tr key={f.key}>
                      <td className="py-2 pr-3 text-muted w-32 align-top">{f.label}</td>
                      <td className="py-2 pr-3 font-medium align-top">
                        {renderValue(result.fields[f.key])}
                      </td>
                      <td className="py-2 text-right align-top">
                        <ConfBadge level={result.confidence[f.key]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {canApprove ? (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => decide("approve")}
                    disabled={isDeciding}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-brand-deep focus-visible:ring-offset-2"
                  >
                    <Check className="h-4 w-4" /> Approve & create
                  </button>
                  <button
                    onClick={() => decide("reject")}
                    disabled={isDeciding}
                    className="inline-flex items-center gap-1.5 rounded-full border border-foreground/30 px-5 py-2 text-sm font-semibold disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-brand-deep focus-visible:ring-offset-1"
                  >
                    <X className="h-4 w-4" /> Reject
                  </button>
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-black/[0.03] px-3 py-2 text-xs text-muted">
                  <Lock className="h-3.5 w-3.5" />
                  Operations approval required — you&apos;re viewing as Finance (read-only).
                </div>
              )}
              <p className="mt-3 text-xs text-muted">
                Human-in-the-loop: the AI never writes to the database. An operator
                approves or rejects, and the decision is recorded with attribution.
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
