# Plan 007: Characterization tests for the query layer (and field-action guards)

> **Executor instructions**: Follow step by step, verify each step, honor STOP
> conditions, update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 20787e3..HEAD -- lib/queries.ts app/actions/field.ts`
> If either changed, re-read the live functions before writing tests; on a
> material mismatch with the excerpts below, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `20787e3`, 2026-06-21
- **Note**: This plan is a PREREQUISITE for Plans 008, 009, 010 (refactors of
  `lib/queries.ts`). Land it first so those refactors can prove behavior is
  preserved.

## Why this matters

`lib/queries.ts` (the only Prisma→domain adapter) and `app/actions/field.ts`
(the lifecycle mutations) have zero automated coverage, while the pure cores
(`lib/margin.ts`, `lib/exceptions.ts`, `lib/field.ts`) are well tested. Plans
008–010 refactor `queries.ts` for performance; without characterization tests
those refactors are unverifiable by a cheaper executor. CI has no database (the
CI `DATABASE_URL` is a dummy) and Vitest runs `environment: "node"`, so these
tests must MOCK Prisma — not hit a real DB.

## Current state

- `vitest.config.ts`: `environment: "node"`, `include: ["tests/**/*.test.ts",
  "evals/**/*.test.ts"]`, `@` alias → repo root.
- `lib/queries.ts` exports (among others):
  - `getHeroStats(now?)` → reads `prisma.meal.findMany({ select: { status: true } })`
    and `prisma.meal.count({ where: { deliveredAt: { gte: weekAgo } } })`; returns
    `{ mealsTracked, deliveredThisWeek, verifiedRate }` (uses `verificationRate`
    from `lib/field`).
  - `getFieldQueue(now?)` → reads `prisma.meal.findMany({ where: { status: { in:
    ["PRODUCED","DELIVERED"] } }, select: { id, status, producedAt, deliveredAt,
    deliveryPhotoUrl, program:{name}, cbo:{name}, market:{borough,neighborhood} } })`,
    maps to `FieldMeal[]`, returns `buildFieldQueue(...)` from `lib/field`.
- `prisma` is imported from `@/lib/db`.
- `app/actions/field.ts` exports `markDelivered(formData)` and
  `markVerified(mealId)`. Both call `requireOperator()` (returns null unless
  `can(role, "operate:field")`), then `prisma.meal.updateMany({ where: { id,
  status: <prior> }, data: {...} })`, then `revalidatePath(...)`. They return a
  `FieldResult` (`{ ok: true, photoUrl } | { ok: false, error }`).
- Pattern to model test style on: `tests/field.test.ts` (Vitest, `@/` alias,
  fixed `NOW` date, `hoursAgo` helper).

## Commands you will need

| Purpose   | Command                                  | Expected |
|-----------|------------------------------------------|----------|
| One file  | `npx vitest run tests/queries.test.ts`   | pass     |
| One file  | `npx vitest run tests/field-actions.test.ts` | pass |
| All tests | `npm test`                               | all pass |
| Typecheck | `npm run typecheck`                      | exit 0   |
| Lint      | `npm run lint`                           | no new errors |

## Scope

**In scope** (create):
- `tests/queries.test.ts`
- `tests/field-actions.test.ts`

**Out of scope**:
- Modifying `lib/queries.ts` or `app/actions/field.ts` — tests only. (Plans
  008–010 modify `queries.ts`.)
- Real database / integration tests — must mock Prisma.
- Testing `getDashboardData`/`getMtmReporting` exhaustively — `getHeroStats` and
  `getFieldQueue` are the required coverage; the others are optional stretch.

## Git workflow

- Branch: `advisor/007-tests-queries-and-field-actions`
- One commit, e.g. `test: characterize query layer and field-action guards`.

## Steps

### Step 1: Test the query layer with mocked Prisma

Create `tests/queries.test.ts`. Mock `@/lib/db` so no real client is
constructed, then drive each function with fixtures and a fixed `now`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const meal = { findMany: vi.fn(), count: vi.fn() };
vi.mock("@/lib/db", () => ({ prisma: { meal } }));

import { getHeroStats, getFieldQueue } from "@/lib/queries";

const NOW = new Date("2026-06-21T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000);

beforeEach(() => { meal.findMany.mockReset(); meal.count.mockReset(); });

describe("getHeroStats", () => {
  it("derives tracked count and verified rate from statuses", async () => {
    meal.findMany.mockResolvedValue([
      { status: "VERIFIED" }, { status: "VERIFIED" },
      { status: "DELIVERED" }, { status: "PRODUCED" }, { status: "PLANNED" },
    ]);
    meal.count.mockResolvedValue(7);
    const s = await getHeroStats(NOW);
    expect(s.mealsTracked).toBe(5);
    expect(s.deliveredThisWeek).toBe(7);
    expect(s.verifiedRate).toBeCloseTo(2 / 3); // 2 verified of 3 delivered+verified
  });
});

describe("getFieldQueue", () => {
  it("maps rows and orders overdue-first via buildFieldQueue", async () => {
    meal.findMany.mockResolvedValue([
      { id: "fresh", status: "PRODUCED", producedAt: hoursAgo(1), deliveredAt: null,
        deliveryPhotoUrl: null, program: { name: "MTM" }, cbo: { name: "POTS" },
        market: { borough: "Bronx", neighborhood: "Mott Haven" } },
      { id: "late", status: "PRODUCED", producedAt: hoursAgo(40), deliveredAt: null,
        deliveryPhotoUrl: null, program: { name: "MTM" }, cbo: { name: "POTS" },
        market: { borough: "Bronx", neighborhood: "Mott Haven" } },
    ]);
    const q = await getFieldQueue(NOW);
    expect(q.map((i) => i.id)).toEqual(["late", "fresh"]); // overdue first
    expect(q[0].marketLabel).toBe("Mott Haven, Bronx");
  });
});
```

**Verify**: `npx vitest run tests/queries.test.ts` → all pass.

### Step 2: Test the field-action guards with mocked modules

Create `tests/field-actions.test.ts`. The action file transitively imports
`server-only`, `next/cache`, and `@/lib/current-role` (which imports
`next/headers`), plus `@vercel/blob`. Mock all of them:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: vi.fn() }));

const updateMany = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { meal: { updateMany } } }));

const role = { value: "OPS" as "OPS" | "FINANCE" | "EXEC" };
vi.mock("@/lib/current-role", () => ({
  getCurrentRole: async () => role.value,
  getOperatorIdentity: async () => "Dana Ortiz · Operations",
}));

import { markVerified } from "@/app/actions/field";

beforeEach(() => { updateMany.mockReset(); role.value = "OPS"; });

describe("markVerified guards", () => {
  it("rejects a role without operate:field", async () => {
    role.value = "FINANCE";
    const res = await markVerified("meal_1");
    expect(res.ok).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });
  it("rejects when no DELIVERED meal matches (count 0)", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    const res = await markVerified("meal_1");
    expect(res.ok).toBe(false);
  });
  it("succeeds when a DELIVERED meal is verified", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    const res = await markVerified("meal_1");
    expect(res.ok).toBe(true);
  });
});
```

(Real `@/lib/roles` `can()` is fine to use unmocked — it's pure. `markDelivered`
can be added similarly with a `FormData`; if `FormData`/`File` mocking in node
proves awkward, cover `markVerified` thoroughly and note `markDelivered` as a
follow-up rather than blocking.)

**Verify**: `npx vitest run tests/field-actions.test.ts` → all pass.

### Step 3: Full suite + gates

**Verify**: `npm test` → all pass (existing 34+ tests plus the new ones).
**Verify**: `npm run typecheck` → exit 0. `npm run lint` → no new errors.

## Test plan

- `tests/queries.test.ts`: `getHeroStats` (tracked count, delivered-this-week,
  verified rate) and `getFieldQueue` (row mapping + overdue-first ordering),
  Prisma mocked.
- `tests/field-actions.test.ts`: `markVerified` role guard (FINANCE rejected),
  transition guard (count 0 → not ok), success path.
- Pattern source: `tests/field.test.ts`.

## Done criteria

ALL must hold:

- [ ] `npm test` passes, including the new `tests/queries.test.ts` and
      `tests/field-actions.test.ts`
- [ ] `npm run typecheck` exits 0; `npm run lint` no new errors
- [ ] No production files modified — only the two new test files (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

Stop and report (do not improvise) if:

- The functions' Prisma call shapes differ from the excerpts (drift) — your
  mocks won't match; re-read and report.
- Module mocking of `server-only`/`next/cache`/`next/headers` cannot be made to
  work in this Vitest setup after a reasonable attempt — in that case land
  `tests/queries.test.ts` alone (it needs none of those mocks) and report the
  action-test blocker; the query tests are the required deliverable.

## Maintenance notes

- These mocked tests pin behavior, not DB integration. If a real test DB is
  introduced later, promote the query tests to integration tests.
- Reviewer: confirm the mocks assert behavior (counts, ordering, guard
  outcomes), not just that functions were called.
