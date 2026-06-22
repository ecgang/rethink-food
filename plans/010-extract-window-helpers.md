# Plan 010: Extract the duplicated time-window / realized filters into shared helpers

> **Executor instructions**: Follow step by step, verify each step, honor STOP
> conditions, update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 20787e3..HEAD -- lib/queries.ts`
> On material mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/007 (query tests prove behavior preserved)
- **Category**: tech-debt
- **Planned at**: commit `20787e3`, 2026-06-21

## Why this matters

`lib/queries.ts` recomputes the same "last 7 days" / "last 30 days" boundaries
and the same "delivered within [start,end)" predicate inline in several
functions (`getKpiDeltas`, `getMarqueeStats`, `getMtmReporting`, `getHeroStats`,
`getActOnToday`). If a window definition changes, ~7 sites must change in
lockstep — a bug surface and a readability cost. Extracting named constants and a
single predicate makes the policy visible and DRY. Behavior must stay identical.

## Current state

- `lib/queries.ts` already defines `const DAY = 24 * 3600 * 1000;` near the top
  and `const isRealized = (s) => s === "DELIVERED" || s === "VERIFIED";`.
- 7-day windows are computed inline as `now.getTime() - 7 * DAY` in multiple
  functions; 30-day as `now.getTime() - 30 * DAY`. `getKpiDeltas` defines a local
  `inWindow(m, start, end)` checking `m.deliveredAt != null && >= start && < end`.

Confirm the sites: `grep -n "7 \* DAY\|30 \* DAY\|deliveredAt.getTime()" lib/queries.ts`.

## Commands you will need

| Purpose   | Command            | Expected |
|-----------|--------------------|----------|
| Typecheck | `npm run typecheck`| exit 0   |
| Tests     | `npm test`         | all pass |
| Build     | `npm run build`    | exit 0 (`DATABASE_URL` set) |
| Lint      | `npm run lint`     | no new errors |

## Scope

**In scope** (only file): `lib/queries.ts`

**Out of scope**: extracting to a new file/module (keep helpers local to
`queries.ts`); changing window sizes or the realized definition; touching
`getDemandMap`'s own inline 7-day window is optional (do it only if trivial).

## Git workflow

- Branch: `advisor/010-extract-window-helpers`
- One commit, e.g. `refactor(queries): share time-window + realized helpers`.

## Steps

### Step 1: Add shared constants and a window predicate

After the existing `DAY` constant, add:

```ts
const WEEK_MS = 7 * DAY;
const MONTH_MS = 30 * DAY;

/** True if a meal was delivered within [start, end) (ms epoch bounds). */
const deliveredInWindow = (
  m: { deliveredAt: Date | null },
  start: number,
  end: number,
): boolean =>
  m.deliveredAt != null &&
  m.deliveredAt.getTime() >= start &&
  m.deliveredAt.getTime() < end;
```

### Step 2: Replace the inline sites

- Replace `now.getTime() - 7 * DAY` with `now.getTime() - WEEK_MS` and
  `- 30 * DAY` with `- MONTH_MS` across the functions.
- Replace `getKpiDeltas`'s local `inWindow` with `deliveredInWindow`.
- For the "delivered since weekAgo" `.filter`s (e.g. in `getMarqueeStats`,
  `getMtmReporting`), use `deliveredInWindow(m, weekAgo, now.getTime())` where it
  preserves the exact same bound (note: some sites use `>= weekAgo` with no upper
  bound — for those, keep the existing single-sided check OR pass
  `Number.POSITIVE_INFINITY` as `end`; do NOT change inclusivity).

Be careful: only replace sites whose semantics are exactly `>= start && < end`.
Where a site is single-sided (`>= weekAgo` only), either leave it or use
`deliveredInWindow(m, weekAgo, Number.POSITIVE_INFINITY)` — confirm results are
identical.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Prove unchanged + gates

**Verify**: `npm test` → all pass (Plan 007 tests). `npm run build` → exit 0.
`npm run lint` → no new errors.

## Test plan

- Rely on Plan 007's query tests. The `getHeroStats` test already pins
  delivered-this-week behavior; if you touch `getKpiDeltas`, optionally add a
  mocked-Prisma test for it asserting the prior/current window split.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0; `npm test` all pass; `npm run build` exit 0
- [ ] `npm run lint` no new errors
- [ ] `grep -n "WEEK_MS\|MONTH_MS\|deliveredInWindow" lib/queries.ts` → ≥4 matches
- [ ] No behavior change in Plan 007 tests
- [ ] Only `lib/queries.ts` modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

Stop and report if:

- You cannot preserve exact inclusivity at a site (single- vs double-sided
  bound) — leave that site as-is and note it rather than risk an off-by-one.
- Any Plan 007 test result changes.

## Maintenance notes

- These helpers are the single place to change window policy. If product later
  wants a 14-day momentum window, change `WEEK_MS` usage at the call site, not
  the constant's meaning.
- Reviewer: scrutinize each replaced `.filter` for inclusivity (`>=` vs `>`,
  `<` vs `<=`).
