# Plan 008: Deduplicate the per-request meal load with React `cache()`

> **Executor instructions**: Follow step by step, verify each step, honor STOP
> conditions, update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 20787e3..HEAD -- lib/queries.ts`
> On material mismatch with the excerpt below, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/007 (query-layer tests must exist to prove no behavior change)
- **Category**: perf
- **Planned at**: commit `20787e3`, 2026-06-21

## Why this matters

`loadEconMeals()` in `lib/queries.ts` issues a full `prisma.meal.findMany` with
all relations + cost line items. It is called independently by
`getDashboardData`, `getActOnToday`, `getKpiDeltas`, `getMarqueeStats`, and
`getMtmReporting`. The dashboard page (`app/(app)/page.tsx`) runs five of these
in one `Promise.all`, and the `(app)` layout's `MarqueeBar` calls
`getMarqueeStats` again — so the **entire Meal table is loaded ~6 times per
dashboard request** (routes are `force-dynamic`, so this repeats every request).
Wrapping the loader in React's request-scoped `cache()` collapses those to one
load per request with a one-line change and no behavior change.

## Current state

- `lib/queries.ts` — the loader, currently a plain async function:

```ts
async function loadEconMeals(): Promise<EconMeal[]> {
  const meals = await prisma.meal.findMany({
    select: { /* id, status, mealDate, producedAt, deliveredAt, contractId,
                 program, contract, kitchen, restaurantPartner, market, cbo,
                 costLineItems */ },
  });
  return meals.map((m) => ({ /* ...EconMeal mapping... */ }));
}
```

Callers (confirm with `grep -n "loadEconMeals" lib/queries.ts` → 1 definition +
5 call sites): `getDashboardData`, `getActOnToday`, `getKpiDeltas`,
`getMarqueeStats`, `getMtmReporting`.

Next.js 16 / React 19 provides `cache` from `"react"` for request-scoped
memoization in RSC. (The map demand loader and field queue use their own
queries and are not in scope here.)

## Commands you will need

| Purpose   | Command                                | Expected |
|-----------|----------------------------------------|----------|
| Typecheck | `npm run typecheck`                    | exit 0   |
| Tests     | `npm test`                             | all pass (incl. Plan 007 query tests) |
| Build     | `npm run build`                        | exit 0 (`DATABASE_URL` set) |
| Lint      | `npm run lint`                         | no new errors |

## Scope

**In scope** (only file to modify):
- `lib/queries.ts`

**Out of scope**:
- Changing any caller, query shape, or the `EconMeal` mapping — behavior must be
  identical; this is purely memoization.
- `getHeroStats`, `getFieldQueue`, `getDemandMap` — they don't use
  `loadEconMeals`; leave them alone.

## Git workflow

- Branch: `advisor/008-cache-econ-meals-load`
- One commit, e.g. `perf(queries): memoize per-request meal load with cache()`.

## Steps

### Step 1: Wrap `loadEconMeals` in `cache()`

Add `cache` to the React import (or add an import) and convert the function to a
cached function expression. Keep the body and return type identical:

```ts
import { cache } from "react";

const loadEconMeals = cache(async (): Promise<EconMeal[]> => {
  const meals = await prisma.meal.findMany({ /* unchanged */ });
  return meals.map((m) => ({ /* unchanged */ }));
});
```

All five call sites already call `loadEconMeals()` with no arguments, so they
need no changes. (If the current definition is `export async function`, the
export was internal-only — verify it is not imported elsewhere with
`grep -rn "loadEconMeals" app lib components`; it should appear only inside
`lib/queries.ts`. If it is exported and used elsewhere, keep it exported:
`export const loadEconMeals = cache(async () => { ... })`.)

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Prove behavior unchanged + build

**Verify**: `npm test` → all pass (the Plan 007 query tests exercise functions
that depend on `loadEconMeals` via mocked Prisma; they must still pass).
**Verify**: `npm run build` → exit 0.
**Verify**: `npm run lint` → no new errors.

### Step 3 (optional, observability): confirm dedup locally

If you can run the app against the Docker DB: in `lib/queries.ts` temporarily add
`console.log("loadEconMeals")` inside the cached function, `npm run dev`, load
`/`, and confirm it logs ONCE per request (not ~6×). Remove the log before
committing. Skip if no local DB.

## Test plan

No new tests are required — Plan 007's `tests/queries.test.ts` already
characterizes the dependent functions and must continue to pass unchanged. The
mock-based tests don't observe caching, so they remain valid. (Caching is
request-scoped; it does not change return values.)

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` all pass (Plan 007 tests included)
- [ ] `npm run build` exits 0; `npm run lint` no new errors
- [ ] `grep -n "cache(async" lib/queries.ts` → 1 match (loadEconMeals)
- [ ] `grep -rn "loadEconMeals" app components` → no matches (still internal)
- [ ] Only `lib/queries.ts` modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

Stop and report if:

- `loadEconMeals` is imported outside `lib/queries.ts` (the export surface is
  wider than assumed — keep it exported and report).
- Tests from Plan 007 do not exist yet — this plan depends on them; land 007
  first.
- `npm test` changes results after wrapping (it must not — caching does not
  alter values; a change means something else drifted).

## Maintenance notes

- `cache()` is request-scoped (per render pass), not a cross-request cache —
  correct here because routes are `force-dynamic` and must reflect live data.
- If a future function needs a *different* projection of meals, give it its own
  cached loader rather than widening `loadEconMeals`'s `select`.
- Reviewer: confirm no call site passes arguments (the cache key is the arg
  list; all callers must call it the same way — they currently call with none).
