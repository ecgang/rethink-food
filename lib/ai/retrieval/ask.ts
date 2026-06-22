// "Ask the Operating Layer" orchestration (feature ④).
//
// An agentic tool-use loop: the model plans which retrieval tools to call, each
// tool returns display-safe Citations, and the model composes an answer that may
// only cite what the tools returned. The deterministic engines own all math; this
// layer only retrieves and narrates. Without an API key it degrades to keyword
// retrieval so the demo still answers (just without synthesis).

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, MODEL_REASON } from "@/lib/ai/client";
import {
  RETRIEVAL_TOOLS,
  dedupeCitations,
  citationsToToolResult,
  type Citation,
} from "@/lib/ai/retrieval/tools";

export interface AskResult {
  answer: string;
  citations: Citation[];
  modelUsed: string;
}

/** Max model turns. The final turn omits tools to force a text answer. */
const MAX_ROUNDS = 4;

const SYSTEM =
  "You are the operating-layer assistant for Rethink Food, a nonprofit food operation. " +
  "You answer staff questions about partners (CBOs and restaurants), funders, contracts, and program activity. " +
  "You have retrieval tools that query the real database. Rules:\n" +
  "- Only state facts returned by the tools. Never invent names, budgets, dates, or counts.\n" +
  "- Refer to records by name. Do NOT put raw record ids in your answer — the Sources list shown beneath your answer is the citation.\n" +
  "- Format the answer in clean, concise Markdown: short paragraphs and bullet lists; use a small table only when comparing several items across the same columns.\n" +
  "- If the tools return nothing relevant, say you don't have that information.\n" +
  "- Be concise and do not compute or estimate figures the tools did not return.";

const byName = new Map(RETRIEVAL_TOOLS.map((t) => [t.name, t]));

const ANTHROPIC_TOOLS: Anthropic.Tool[] = RETRIEVAL_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.inputSchema,
}));

/**
 * Answer a natural-language question by letting the model drive bounded
 * retrieval tools, then synthesizing a cited answer. `question` must already be
 * screened (see lib/ai/screen.ts) and capability-gated by the caller.
 */
export async function askOperatingLayer(question: string): Promise<AskResult> {
  const client = getAnthropic();
  if (!client) return fallbackAsk(question);

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  const allCitations: Citation[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const lastRound = round === MAX_ROUNDS - 1;
    const res = await client.messages.create({
      model: MODEL_REASON,
      max_tokens: 1024,
      system: SYSTEM,
      messages,
      ...(lastRound ? {} : { tools: ANTHROPIC_TOOLS }),
    });

    if (!lastRound && res.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: res.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        const tool = byName.get(block.name);
        let citations: Citation[] = [];
        try {
          citations = tool ? await tool.run((block.input ?? {}) as Record<string, unknown>) : [];
        } catch {
          citations = []; // a tool failure becomes "no records", never a crash
        }
        allCitations.push(...citations);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: citationsToToolResult(citations),
        });
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    const answer = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return {
      answer: answer || "I don't have that information.",
      citations: dedupeCitations(allCitations),
      modelUsed: MODEL_REASON,
    };
  }

  return {
    answer: "I gathered the records below but couldn't fully resolve the question in the allotted steps.",
    citations: dedupeCitations(allCitations),
    modelUsed: MODEL_REASON,
  };
}

/**
 * No-key fallback: run keyword retrieval over the same tools and return the
 * matching records without synthesis. Still grounded in real data, still cited.
 */
async function fallbackAsk(question: string): Promise<AskResult> {
  const citations: Citation[] = [];
  const searchPartners = byName.get("search_partners");
  const getContracts = byName.get("get_contracts");
  const listFunders = byName.get("list_funders");

  if (searchPartners) citations.push(...(await safeRun(searchPartners.run({ query: question }))));
  if (getContracts) citations.push(...(await safeRun(getContracts.run({ funder: question }))));
  if (/\bfunder|budget|grant|funding\b/i.test(question) && listFunders) {
    citations.push(...(await safeRun(listFunders.run({}))));
  }

  const deduped = dedupeCitations(citations);
  return {
    answer:
      deduped.length > 0
        ? "AI synthesis is unavailable (no API key configured), so here are the records that match your question:"
        : "AI synthesis is unavailable (no API key configured), and no records matched your question.",
    citations: deduped,
    modelUsed: "keyword-fallback",
  };
}

async function safeRun(p: Promise<Citation[]>): Promise<Citation[]> {
  try {
    return await p;
  } catch {
    return [];
  }
}
