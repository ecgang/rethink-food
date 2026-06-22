// Shared Anthropic client for the AI operating layer.
//
// Design rule (see plans/ai-operating-layer.md): the AI layer narrates, drafts,
// and retrieves — it never computes a billable number. Generators that turn
// already-computed data into prose live in lib/ai/* and MUST NOT import lib/db.
// The single exception is lib/ai/retrieval/* (feature ④), which queries Prisma
// through explicit field whitelists.

import Anthropic from "@anthropic-ai/sdk";

// Model tiers. Fast = cheap structured extraction/narration; Reason = the
// agentic retrieval loop, which benefits from stronger tool-use planning.
export const MODEL_FAST = "claude-haiku-4-5";
export const MODEL_REASON = "claude-sonnet-4-6";

/** True when a live model can be called. When false, every feature falls back
 *  to a deterministic path so the demo always works offline. */
export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | undefined;

/**
 * Lazily-memoized Anthropic client. Returns null when no key is configured so
 * callers branch to their deterministic fallback rather than throwing.
 */
export function getAnthropic(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  client ??= new Anthropic({ apiKey });
  return client;
}
