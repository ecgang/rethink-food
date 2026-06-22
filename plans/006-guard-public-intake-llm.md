# Plan 006: Bound the public AI-intake action's input to limit cost-abuse

> **Executor instructions**: Follow step by step, verify each step, honor STOP
> conditions, update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 20787e3..HEAD -- lib/intake.ts app/(app)/intake/actions.ts`
> On mismatch with excerpts below, STOP.

## Status

- **Priority**: P2
- **Effort**: S→M
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `20787e3`, 2026-06-21

## Why this matters

`/intake`'s `parseAction` is callable by any visitor on the public deployment
and, when `ANTHROPIC_API_KEY` is set, forwards raw user text straight to the
Anthropic API with no input bound. An attacker can submit very large payloads
repeatedly to inflate token cost (a cost-based DoS). The highest-leverage cheap
guard is a hard input-length cap applied before the model call (it also bounds
the deterministic fallback's work). Prompt-injection of the model output is
already mitigated — output is Zod-validated (`intakeFieldsSchema.parse`) and
rendered as escaped text by React — so this plan focuses on the cost bound and
marks durable per-client rate limiting as a documented follow-up.

## Current state

- `app/(app)/intake/actions.ts` — `parseAction` trims and delegates:

```ts
export async function parseAction(raw: string): Promise<IntakeParseResult> {
  const trimmed = raw.trim();
  if (!trimmed) { /* returns empty result */ }
  return parseIntakeEmail(trimmed);
}
```

- `lib/intake.ts` — `parseIntakeEmail(raw, today)` calls Anthropic with
  `messages: [{ role: "user", content: raw }]` (no length bound), falling back to
  `deterministicParse(raw)` when no key. `max_tokens` is already capped at 1024.
- `intakeFieldsSchema` (Zod) validates the model's structured output before use.

Convention: pure, testable helpers live in `lib/`; tests live in `tests/` and
`evals/` (`vitest.config.ts` includes both), `environment: "node"`.

## Commands you will need

| Purpose   | Command                          | Expected |
|-----------|----------------------------------|----------|
| Typecheck | `npm run typecheck`              | exit 0   |
| Tests     | `npm test`                       | all pass |
| One test  | `npx vitest run tests/intake-cap.test.ts` | pass |
| Lint      | `npm run lint`                   | no new errors |

## Scope

**In scope**:
- `lib/intake.ts` (input-length cap, applied at the top of `parseIntakeEmail`)
- `tests/intake-cap.test.ts` (create)

**Out of scope**:
- `app/(app)/intake/actions.ts` logic beyond what's needed — the cap belongs in
  `lib/intake.ts` so every caller is protected; you may leave `parseAction`
  unchanged.
- Durable rate limiting (Upstash/Vercel KV) — a real but heavier follow-up; do
  NOT add a new external dependency in this plan.
- Any change to the model, tool schema, or the deterministic parser logic.

## Git workflow

- Branch: `advisor/006-guard-public-intake-llm`
- One commit, e.g. `sec(intake): cap raw input length before model/parse`.

## Steps

### Step 1: Add an exported input cap and apply it

In `lib/intake.ts`, add an exported constant and a tiny pure helper, then apply
it as the first line of `parseIntakeEmail`:

```ts
/** Hard cap on intake free-text length — bounds token cost and parse work. */
export const MAX_INTAKE_CHARS = 4000;

/** Trim and truncate intake text to the cost cap. */
export function capIntakeInput(raw: string): string {
  return raw.trim().slice(0, MAX_INTAKE_CHARS);
}
```

In `parseIntakeEmail`, replace the use of `raw` with a capped local at the top:

```ts
export async function parseIntakeEmail(
  raw: string,
  today: Date = new Date(),
): Promise<IntakeParseResult> {
  const capped = capIntakeInput(raw);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return deterministicParse(capped);
  // ...use `capped` everywhere `raw` was used below (the messages content and
  //    any deterministic fallback call)...
}
```

Make sure BOTH the `messages: [{ role: "user", content: capped }]` and the
fallback `deterministicParse(capped)` calls use the capped value.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Add a focused unit test

Create `tests/intake-cap.test.ts`, modeled on the structure of
`tests/field.test.ts` (same `import { describe, it, expect } from "vitest"`,
`@/lib/...` alias):

```ts
import { describe, it, expect } from "vitest";
import { capIntakeInput, MAX_INTAKE_CHARS } from "@/lib/intake";

describe("capIntakeInput", () => {
  it("trims surrounding whitespace", () => {
    expect(capIntakeInput("  hello  ")).toBe("hello");
  });
  it("truncates to the cap", () => {
    const long = "x".repeat(MAX_INTAKE_CHARS + 500);
    expect(capIntakeInput(long).length).toBe(MAX_INTAKE_CHARS);
  });
  it("leaves short input unchanged", () => {
    expect(capIntakeInput("a halal meal request").length).toBeLessThan(MAX_INTAKE_CHARS);
  });
});
```

**Verify**: `npx vitest run tests/intake-cap.test.ts` → all pass.
**Verify**: `npm test` → all pass (no regressions in `evals/intake.test.ts`).

### Step 3: Lint

**Verify**: `npm run lint` → no new errors.

## Test plan

- New file `tests/intake-cap.test.ts`: trims whitespace; truncates over-cap
  input to exactly `MAX_INTAKE_CHARS`; leaves short input intact.
- Pattern source: `tests/field.test.ts`.
- Confirm `evals/intake.test.ts` still passes (the cap is well above the eval
  samples' length).

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` passes, including the 3 new cap tests
- [ ] `grep -n "capIntakeInput\|MAX_INTAKE_CHARS" lib/intake.ts` → ≥3 matches
- [ ] `parseIntakeEmail` uses the capped value for BOTH the API and fallback paths
- [ ] Only `lib/intake.ts` and `tests/intake-cap.test.ts` modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

Stop and report if:

- `parseIntakeEmail`'s signature or body differs materially from the excerpt
  (drift).
- The eval suite (`evals/intake.test.ts`) starts failing because a sample
  exceeds 4000 chars (raise the cap or report — do not silently truncate evals).

## Maintenance notes

- Durable, per-client rate limiting is the real production control for the
  cost-DoS vector and is deliberately deferred (needs Vercel KV/Upstash). Leave
  a one-line comment near the cap pointing to that follow-up.
- Reviewer: confirm the cap is applied before the network call, not after.
