"use server";

import { prisma } from "@/lib/db";
import { getCurrentRole, getOperatorIdentity } from "@/lib/current-role";
import { can } from "@/lib/roles";
import { screenText } from "@/lib/ai/screen";
import { askOperatingLayer, type AskResult } from "@/lib/ai/retrieval/ask";

/**
 * Answer a natural-language question over partner / funder / contract records.
 * Capability-gated (so the LLM endpoint isn't anonymous), screened for injection,
 * then logged for the audit trail.
 */
export async function askAction(question: string): Promise<AskResult> {
  // Gate the model endpoint against anonymous use. search:records is granted to
  // every role; the check is defense-in-depth alongside the input cap.
  if (!can(await getCurrentRole(), "search:records")) {
    return {
      answer: "Your role does not have permission to search records.",
      citations: [],
      modelUsed: "unauthorized",
    };
  }

  const trimmed = question.trim();
  if (!trimmed) {
    return {
      answer: "Ask a question about partners, funders, contracts, or program activity.",
      citations: [],
      modelUsed: "none",
    };
  }

  // Input safety screen — runs before the model, costs nothing.
  const screen = screenText(trimmed);
  if (!screen.ok) {
    return {
      answer: `Your question was flagged and not run: ${screen.reason}`,
      citations: [],
      modelUsed: "flagged",
    };
  }

  const result = await askOperatingLayer(trimmed);

  // Persist for the audit trail. Defensive: if the AskLog table hasn't been
  // migrated yet, logging must not break the answer (the deliverable).
  try {
    await prisma.askLog.create({
      data: {
        question: trimmed,
        answer: result.answer,
        citations: result.citations.map((c) => ({ type: c.type, id: c.id, label: c.label })),
        modelUsed: result.modelUsed,
        askedBy: await getOperatorIdentity(),
      },
    });
  } catch {
    // swallow — see note above
  }

  return result;
}
