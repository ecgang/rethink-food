// Morning Briefing generator (feature ③).
//
// Pure with respect to the database: it takes the deterministic engine's output
// (ExceptionItem[]) and narrates it. NO lib/db import. The engine owns severity
// and the set of exceptions; the model only explains and prioritizes. Two structural
// guards enforce that:
//   1. The tool schema restricts reasonCode to the codes actually present.
//   2. filterToKnown() drops any (reasonCode, entityId) pair not in the input and
//      copies severity from the engine row — the model cannot invent or re-rank.
// Any model failure falls back to a deterministic briefing built from severity counts.

import type Anthropic from "@anthropic-ai/sdk";
import type { ExceptionItem, Severity } from "@/lib/exceptions";
import { getAnthropic, MODEL_FAST } from "@/lib/ai/client";

export interface BriefingItem {
  reasonCode: string;
  entityType: ExceptionItem["entityType"];
  entityId: string;
  severity: Severity;
  why: string;
  suggestedAction: string;
}

export interface Briefing {
  summary: string;
  prioritized: BriefingItem[];
  modelUsed: string;
  generatedAt: string; // ISO-8601
}

const MAX_PRIORITIZED = 5;
const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };

const SYSTEM =
  "You write the morning operations briefing for Rethink Food, a nonprofit food operation. " +
  "The exceptions provided are computed by a deterministic engine and are AUTHORITATIVE: " +
  "do not invent exceptions that aren't listed, do not change their severities, and do not invent numbers. " +
  "For the most important items, explain in plain English why each matters and give a concrete next action. " +
  "Reference each item by its reasonCode and entityId exactly as given. Always call submit_briefing.";

function summarize(items: ExceptionItem[]): string {
  if (items.length === 0) return "Nothing needs attention right now — no open exceptions.";
  const counts: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const i of items) counts[i.severity]++;
  const parts = (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as Severity[])
    .filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s.toLowerCase()}`);
  const noun = items.length === 1 ? "exception" : "exceptions";
  return `${items.length} open ${noun} (${parts.join(", ")}). Top items below.`;
}

/**
 * Keep only model items that match a real engine exception by (reasonCode, entityId).
 * Severity, entityType always come from the engine row — never the model. Exported for tests.
 */
export function filterToKnown(
  prioritized: { reasonCode?: unknown; entityId?: unknown; why?: unknown; suggestedAction?: unknown }[],
  items: ExceptionItem[],
): BriefingItem[] {
  const byKey = new Map(items.map((i) => [`${i.reasonCode}::${i.entityId}`, i]));
  const out: BriefingItem[] = [];
  for (const p of prioritized) {
    const key = `${String(p.reasonCode)}::${String(p.entityId)}`;
    const match = byKey.get(key);
    if (!match) continue; // hallucinated or re-ranked reference — drop it
    out.push({
      reasonCode: match.reasonCode,
      entityType: match.entityType,
      entityId: match.entityId,
      severity: match.severity, // authoritative
      why: typeof p.why === "string" && p.why.trim() ? p.why.trim() : match.detail,
      suggestedAction:
        typeof p.suggestedAction === "string" && p.suggestedAction.trim()
          ? p.suggestedAction.trim()
          : match.recommendedAction,
    });
  }
  return out;
}

/** Deterministic briefing from severity counts + the engine's own copy. Exported for tests. */
export function fallbackBriefing(items: ExceptionItem[], generatedAt: string): Briefing {
  const prioritized = [...items]
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
    .slice(0, MAX_PRIORITIZED)
    .map((i) => ({
      reasonCode: i.reasonCode,
      entityType: i.entityType,
      entityId: i.entityId,
      severity: i.severity,
      why: i.detail,
      suggestedAction: i.recommendedAction,
    }));
  return { summary: summarize(items), prioritized, modelUsed: "deterministic-fallback", generatedAt };
}

function buildTool(reasonCodes: string[]): Anthropic.Tool {
  return {
    name: "submit_briefing",
    description: "Submit the morning operations briefing.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "1-2 sentence overview of what needs attention today." },
        prioritized: {
          type: "array",
          description: "The most important items, most urgent first.",
          items: {
            type: "object",
            properties: {
              reasonCode: { type: "string", enum: reasonCodes },
              entityId: { type: "string", description: "The entityId of the exception, exactly as given." },
              why: { type: "string", description: "Plain-English explanation of why this matters." },
              suggestedAction: { type: "string", description: "A concrete next action for the operator." },
            },
            required: ["reasonCode", "entityId", "why", "suggestedAction"],
          },
        },
      },
      required: ["summary", "prioritized"],
    },
  };
}

function renderItems(items: ExceptionItem[]): string {
  return items
    .map(
      (i) =>
        `[${i.reasonCode}::${i.entityId}] (${i.severity}) ${i.title} — ${i.detail} ` +
        `Recommended: ${i.recommendedAction}`,
    )
    .join("\n");
}

/**
 * Narrate the engine's exceptions into a prioritized morning briefing. Uses the
 * model when a key is set; otherwise (or on any failure) returns the deterministic fallback.
 */
export async function generateBriefing(items: ExceptionItem[]): Promise<Briefing> {
  const generatedAt = new Date().toISOString();
  if (items.length === 0) {
    return { summary: summarize(items), prioritized: [], modelUsed: "none", generatedAt };
  }

  const client = getAnthropic();
  if (!client) return fallbackBriefing(items, generatedAt);

  try {
    const reasonCodes = [...new Set(items.map((i) => i.reasonCode))];
    const tool = buildTool(reasonCodes);
    const res = await client.messages.create({
      model: MODEL_FAST,
      max_tokens: 1024,
      system: SYSTEM,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [{ role: "user", content: renderItems(items) }],
    });

    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return fallbackBriefing(items, generatedAt);

    const input = block.input as { summary?: unknown; prioritized?: unknown };
    const rawPrioritized = Array.isArray(input.prioritized) ? input.prioritized : [];
    const prioritized = filterToKnown(rawPrioritized, items).slice(0, MAX_PRIORITIZED);
    // If the model produced nothing that maps to a real exception, fall back.
    if (prioritized.length === 0) return fallbackBriefing(items, generatedAt);

    const summary =
      typeof input.summary === "string" && input.summary.trim()
        ? input.summary.trim()
        : summarize(items);
    return { summary, prioritized, modelUsed: MODEL_FAST, generatedAt };
  } catch {
    return fallbackBriefing(items, generatedAt);
  }
}
