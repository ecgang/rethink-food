# Plan 003: `npm run lint` passes clean and CI gates on it

> **Executor instructions**: Follow step by step. Run every verification command
> and confirm the result. On any "STOP condition", stop and report. When done,
> update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 20787e3..HEAD -- components/use-count-up.ts prisma/seed.ts .github/workflows/ci.yml`
> If any changed, compare "Current state" excerpts to live code; on mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `20787e3`, 2026-06-21

## Why this matters

The repo has an ESLint config and a `lint` script, but CI
(`.github/workflows/ci.yml`) runs typecheck + test + build only — never lint.
As a result `npm run lint` currently FAILS (1 error, 1 warning) on `main`
unnoticed. This plan fixes the two existing violations, then adds lint to CI so
regressions are caught. Order matters: add the CI step only after lint is green,
or CI breaks immediately.

## Current state

`npm run lint` today reports exactly:

```
components/use-count-up.ts:14  error  Avoid calling setState() directly within an effect  react-hooks/set-state-in-effect
prisma/seed.ts:113             warning  'marketByHood' is assigned a value but never used  @typescript-eslint/no-unused-vars
✖ 2 problems (1 error, 1 warning)
```

- `components/use-count-up.ts` — animation hook. The error is the reduced-motion
  early-return that synchronously sets state inside `useEffect`:

```ts
useEffect(() => {
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    setValue(target);   // <-- line 14: react-hooks/set-state-in-effect
    return;
  }
  let raf = 0;
  // ...requestAnimationFrame animation...
}, [target, durationMs]);
```

- `prisma/seed.ts:113` — `const marketByHood = Object.fromEntries(markets.map((m) => [m.neighborhood, m]));`
  is assigned but never read (the seed uses `nearestMarket`/`marketsInBorough`
  instead). Confirm with `grep -n "marketByHood" prisma/seed.ts` → only one line.

- `.github/workflows/ci.yml` — current steps: `npm ci` → `npx prisma generate`
  → `npm run typecheck` → `npm test` → `npm run build`. No lint step.

Convention: ESLint extends `eslint-config-next` (`eslint.config.mjs`).

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Lint      | `npm run lint`     | exit 0, **0 problems** |
| Typecheck | `npm run typecheck`| exit 0              |
| Tests     | `npm test`         | all pass            |
| Build     | `npm run build`    | exit 0 (`DATABASE_URL` set) |

## Scope

**In scope**:
- `components/use-count-up.ts`
- `prisma/seed.ts` (delete the one unused line)
- `.github/workflows/ci.yml` (add the lint step)

**Out of scope**:
- Any other lint rule tuning or `eslint.config.mjs` changes.
- Refactoring the animation behavior of `useCountUp` — the visible behavior
  (instant jump under reduced-motion, eased count otherwise) must stay identical.

## Git workflow

- Branch: `advisor/003-lint-clean-and-ci-gate`
- One commit, e.g. `ci: fix lint violations and gate CI on eslint`.

## Steps

### Step 1: Resolve the `use-count-up.ts` error without changing behavior

The reduced-motion jump is intentional (accessibility: no animation). Keep the
behavior; satisfy the rule with a scoped, justified disable on that line:

```ts
    // Reduced motion: jump straight to the target (no animation). Intentional
    // immediate set; the rule targets derived-state effects, not this.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(target);
```

Do NOT convert this to a lazy `useState` initializer — that reads `window` and
would cause an SSR/client hydration mismatch for this client component.

**Verify**: `npm run lint` → the `use-count-up.ts` error is gone (the seed
warning may remain until Step 2).

### Step 2: Remove the unused `marketByHood` binding

Delete the single line `const marketByHood = Object.fromEntries(...)` at
`prisma/seed.ts:113`. Confirm nothing references it.

**Verify**: `grep -n "marketByHood" prisma/seed.ts` → no matches.
**Verify**: `npm run lint` → exit 0, **0 problems**.
**Verify**: `npm run typecheck` → exit 0 (seed is typechecked).

### Step 3: Add the lint step to CI

In `.github/workflows/ci.yml`, add a `- run: npm run lint` step immediately
after the `npm run typecheck` step (before `npm test`).

**Verify**: the file now contains `npm run lint`:
`grep -n "npm run lint" .github/workflows/ci.yml` → 1 match, positioned after
typecheck and before test.

### Step 4: Full local gate

**Verify**: `npm run lint` → 0 problems; `npm run typecheck` → 0; `npm test` →
all pass; `npm run build` → exit 0.

## Test plan

No new unit tests (this is tooling). The verification gate IS the test: a clean
`npm run lint` plus the CI step. If you can run `act` or push a branch, confirm
CI runs the lint step; otherwise the YAML grep check suffices.

## Done criteria

ALL must hold:

- [ ] `npm run lint` exits 0 with 0 problems
- [ ] `npm run typecheck` exits 0
- [ ] `npm test` all pass
- [ ] `npm run build` exits 0
- [ ] `grep -n "npm run lint" .github/workflows/ci.yml` → 1 match after typecheck
- [ ] `grep -n "marketByHood" prisma/seed.ts` → no matches
- [ ] Only the three in-scope files modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

Stop and report if:

- `npm run lint` reports MORE than the two documented problems (new violations
  introduced since this plan was written — the codebase drifted).
- Deleting `marketByHood` causes a typecheck/seed error (it is referenced after
  all — drift).
- Disabling the rule still leaves a lint error on `use-count-up.ts` (the rule
  name changed in a dependency bump).

## Maintenance notes

- Once CI gates on lint, every future PR must pass `npm run lint`. If a rule
  becomes noisy, tune it in `eslint.config.mjs` rather than scattering disables.
- Reviewer: confirm the `useCountUp` behavior is byte-for-byte the same (only a
  comment + disable directive added), and that the CI lint step runs before
  tests so failures surface early.
