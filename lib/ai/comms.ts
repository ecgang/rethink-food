// Draft generators for the comms agent (⑤) — and the folded-in ② report narrator.
//
// Pure with respect to the database: each generator takes already-fetched, typed
// context and returns draft {subject, body}. NO lib/db import. Every generator has
// a deterministic mail-merge fallback so the demo works without an API key, and the
// model is instructed to ground every claim in the provided context (never invent
// names, dates, amounts, or commitments). These produce DRAFTS only — nothing sends.

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL_FAST } from "@/lib/ai/client";
import { formatUsdCompact } from "@/lib/money";
import type { WeeklyReportPayload } from "@/lib/reports";

export interface DraftContent {
  subject: string;
  body: string;
  modelUsed: string;
}

const DRAFT_TOOL: Anthropic.Tool = {
  name: "submit_draft",
  description: "Submit the drafted message for human review.",
  input_schema: {
    type: "object",
    properties: {
      subject: { type: "string", description: "A short subject line." },
      body: { type: "string", description: "The message body. Plain text, a few short paragraphs." },
    },
    required: ["subject", "body"],
  },
};

async function generateDraft(
  system: string,
  userContent: string,
  fallback: () => DraftContent,
): Promise<DraftContent> {
  const client = getAnthropic();
  if (!client) return fallback();
  try {
    const res = await client.messages.create({
      model: MODEL_FAST,
      max_tokens: 800,
      system,
      tools: [DRAFT_TOOL],
      tool_choice: { type: "tool", name: DRAFT_TOOL.name },
      messages: [{ role: "user", content: userContent }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return fallback();
    const input = block.input as { subject?: unknown; body?: unknown };
    const fb = fallback();
    return {
      subject: typeof input.subject === "string" && input.subject.trim() ? input.subject.trim() : fb.subject,
      body: typeof input.body === "string" && input.body.trim() ? input.body.trim() : fb.body,
      modelUsed: MODEL_FAST,
    };
  } catch {
    return fallback();
  }
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

export interface IntakeClarificationCtx {
  cboName: string | null;
  missingFields: string[];
}

export function draftIntakeClarification(ctx: IntakeClarificationCtx): Promise<DraftContent> {
  const who = ctx.cboName ?? "there";
  const asks = ctx.missingFields.length ? ctx.missingFields.join(", ") : "the delivery details";
  const fallback = (): DraftContent => ({
    subject: "Quick follow-up on your meal request",
    body:
      `Hi ${who},\n\n` +
      `Thank you for your meal request. Before we can schedule it, could you confirm ${asks}? ` +
      `Once we have those details we'll get it on the calendar right away.\n\n` +
      `Thank you,\nRethink Food`,
    modelUsed: "template-fallback",
  });
  const system =
    "You draft a short, warm clarification email from Rethink Food (a nonprofit food operation) to a " +
    "community partner whose meal request is missing details. Ask only for the listed missing fields. " +
    "Be concise and friendly. Never invent details, quantities, or dates. Always call submit_draft.";
  return generateDraft(system, `Partner: ${who}. Missing fields to ask about: ${asks}.`, fallback);
}

export interface DeliveryNudgeCtx {
  mealLabel: string;
  cboName: string;
  issue: "undelivered" | "unverified";
  hours: number;
}

export function draftDeliveryNudge(ctx: DeliveryNudgeCtx): Promise<DraftContent> {
  const verb = ctx.issue === "undelivered" ? "still awaiting delivery" : "delivered but not yet verified";
  const fallback = (): DraftContent => ({
    subject:
      ctx.issue === "undelivered"
        ? `Delivery pending: ${ctx.mealLabel}`
        : `Verification needed: ${ctx.mealLabel}`,
    body:
      `Heads up — ${ctx.mealLabel} for ${ctx.cboName} is ${verb} (~${Math.round(ctx.hours)}h). ` +
      `Please ${ctx.issue === "undelivered" ? "dispatch the delivery" : "capture the delivery confirmation"} ` +
      `so we can close the loop and keep the contract billable.`,
    modelUsed: "template-fallback",
  });
  const system =
    "You draft a short, direct internal operations nudge for Rethink Food about a meal stuck in its " +
    "lifecycle. Be action-oriented. Never invent facts beyond those provided. Always call submit_draft.";
  return generateDraft(
    system,
    `Meal: ${ctx.mealLabel}. Partner: ${ctx.cboName}. Status: ${verb}. Hours elapsed: ${Math.round(ctx.hours)}.`,
    fallback,
  );
}

export interface ReconciliationFlagCtx {
  contractName: string;
  funderName: string;
  reason: string;
}

export function draftReconciliationFlag(ctx: ReconciliationFlagCtx): Promise<DraftContent> {
  const fallback = (): DraftContent => ({
    subject: `Reconciliation: ${ctx.contractName}`,
    body:
      `Flagging ${ctx.contractName} (${ctx.funderName}) for finance review.\n\n` +
      `Reason: ${ctx.reason}\n\n` +
      `Please review and take the appropriate billing action.`,
    modelUsed: "template-fallback",
  });
  const system =
    "You draft a short internal finance/reconciliation note for Rethink Food flagging a contract that " +
    "needs billing attention. Be precise and neutral. Never invent amounts or dates beyond those provided. " +
    "Always call submit_draft.";
  return generateDraft(
    system,
    `Contract: ${ctx.contractName}. Funder: ${ctx.funderName}. Reason: ${ctx.reason}.`,
    fallback,
  );
}

export function draftReportNarrative(
  payload: WeeklyReportPayload,
  audience: "board" | "funder",
): Promise<DraftContent> {
  const endLabel = new Date(payload.periodEnd).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const t = payload.totals;
  const topFunders = payload.funders.slice(0, 5);
  const fallback = (): DraftContent => ({
    subject:
      audience === "board"
        ? `Board summary — week ending ${endLabel}`
        : `Funder impact — week ending ${endLabel}`,
    body:
      `In the week ending ${endLabel}, Rethink Food served ${t.mealsServed.toLocaleString("en-US")} meals, ` +
      `delivering ${formatUsdCompact(t.dollarsDeliveredCents)} in reimbursable value and ` +
      `${formatUsdCompact(t.contributionMarginCents)} in contribution margin. ` +
      `Funding spanned ${payload.funders.length} partner${payload.funders.length === 1 ? "" : "s"}` +
      (topFunders[0] ? `, led by ${topFunders[0].name}.` : "."),
    modelUsed: "template-fallback",
  });
  const system =
    `You write a ${audience === "board" ? "board summary" : "funder impact"} narrative for Rethink Food ` +
    `using ONLY the numbers in the provided data. Never invent or extrapolate figures. Write 2-3 short ` +
    `paragraphs in a ${audience === "board" ? "plain stakeholder" : "outcomes-focused"} tone. Reference ` +
    `metrics by name. Put a title in subject and the narrative in body. Always call submit_draft.`;
  const rendered =
    `Period ending: ${endLabel}\n` +
    `Meals served: ${t.mealsServed}\n` +
    `Dollars delivered: ${formatUsdCompact(t.dollarsDeliveredCents)}\n` +
    `Contribution margin: ${formatUsdCompact(t.contributionMarginCents)}\n` +
    `Funders (${payload.funders.length}): ` +
    topFunders.map((f) => `${f.name} — ${f.mealsServed} meals`).join("; ");
  return generateDraft(system, rendered, fallback);
}
