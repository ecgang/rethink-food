// Pure input safety screen — runs BEFORE any model call, for every free-text
// entry point (intake parsing, the "ask" search box). Flags obviously unsafe or
// malformed input so it can be routed to human review without spending a token.
//
// This is a PRE-LLM gate (defense-in-depth): it decides whether to call the
// model at all. It does NOT bound what the model does with tools afterward —
// that is enforced by the per-tool field whitelists in lib/ai/retrieval. The
// production upgrade is an LLM moderation pass (e.g. Model Armor / Anthropic
// moderation) that catches subtler injections and policy violations.

export const MAX_INPUT_CHARS = 4000;

export type ScreenResult = { ok: true } | { ok: false; reason: string };

/** Trim and truncate free text to the cost cap. */
export function capInput(raw: string, maxChars: number = MAX_INPUT_CHARS): string {
  return raw.trim().slice(0, maxChars);
}

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous/i,
  /disregard\s+(all\s+)?(previous|prior)/i,
  /system\s*:/i,
  /you\s+are\s+now/i,
  /act\s+as/i,
  /forget\s+(your|all|everything)/i,
  /override\s+.*instructions/i,
  /new\s+instructions\s*:/i,
];

/**
 * Screen free text for emptiness, cost-cap overflow, control-character pastes,
 * and prompt-injection markers. Returns a discriminated result so callers can
 * surface the reason in a human-review path.
 */
export function screenText(
  raw: string,
  maxChars: number = MAX_INPUT_CHARS,
): ScreenResult {
  // 1. Empty / whitespace-only
  if (!raw.trim()) {
    return { ok: false, reason: "Input is empty." };
  }

  // 2. Over the cost cap
  if (raw.length > maxChars) {
    return { ok: false, reason: `Input exceeds the ${maxChars}-character limit.` };
  }

  // 3. Binary / control-character paste heuristic. Flag if more than 5% of
  //    characters are non-printable (excludes normal whitespace: space, tab, CR, LF).
  const controlCount = Array.from(raw).filter((ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    return cp < 32 && cp !== 9 && cp !== 10 && cp !== 13;
  }).length;
  if (controlCount / raw.length > 0.05) {
    return { ok: false, reason: "Input contains an unusual density of control characters." };
  }

  // 4. Prompt-injection denylist (case-insensitive). A heuristic guard, not a
  //    classifier — the production upgrade is an LLM moderation pass.
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(raw)) {
      return { ok: false, reason: "Input contains a potential prompt-injection marker." };
    }
  }

  return { ok: true };
}
