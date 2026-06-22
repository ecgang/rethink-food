# Plan 009: Replace per-iteration meal scans with O(1) Map lookups

> **Executor instructions**: Follow step by step, verify each step, honor STOP
> conditions, update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 20787e3..HEAD -- lib/queries.ts`
> On material mismatch with the excerpts, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/007 (query tests prove behavior preserved); best landed
  after plans/008
- **Category**: perf
- **Planned at**: commit `20787e3`, 2026-06-21

## Why this matters

`getActOnToday` and `getMtmReporting` in `lib/queries.ts` re-scan the full meals
array inside loops: `getActOnToday` does `meals.filter((m) => m.kitchenId ===
k.id)` once per kitchen, and `getMtmReporting` filters `mtmMeals` once per Social
Care Network. That's O(kitchens × meals) and O(SCNs × meals) per call. Building a
grouping Map once turns each into O(1) lookups. Pure refactor, identical results.

## Current state

- `lib/queries.ts`, in `getActOnToday` — kitchen snapshot build (~lines 205–227):

```ts
const kitchenSnapshots: KitchenSnapshot[] = kitchensRaw.map((k) => {
  const kMeals = meals.filter((m) => m.kitchenId === k.id);
  const producedThisWeek = kMeals.filter(
    (m) => m.producedAt && m.producedAt.getTime() >= weekAgo,
  ).length;
  const foodTotals = kMeals.reduce(/* ... */);
  return { /* ... */ };
});
```

- `lib/queries.ts`, in `getMtmReporting` — per-SCN build (~lines 342–357):

```ts
const byScn = scns.map((scn) => {
  const scnMembers = active.filter((m) => m.scnPartner === scn).length;
  const scnMeals = mtmMeals.filter((m) => m.scnPartner === scn && isRealized(m.status));
  /* ... */
});
```

## Commands you will need

| Purpose   | Command            | Expected |
|-----------|--------------------|----------|
| Typecheck | `npm run typecheck`| exit 0   |
| Tests     | `npm test`         | all pass |
| Build     | `npm run build`    | exit 0 (`DATABASE_URL` set) |
| Lint      | `npm run lint`     | no new errors |

## Scope

**In scope** (only file): `lib/queries.ts`

**Out of scope**: any change to return shapes, thresholds, or the exception/MTM
logic. Results must be identical — this is grouping, not logic.

## Git workflow

- Branch: `advisor/009-map-lookups-in-queries`
- One commit, e.g. `perf(queries): group meals by kitchen/SCN once, not per-loop`.

## Steps

### Step 1: Group meals by kitchen once in `getActOnToday`

Before the `kitchensRaw.map(...)`, build a Map and use it:

```ts
const mealsByKitchen = new Map<string, typeof meals>();
for (const m of meals) {
  if (!m.kitchenId) continue;
  const arr = mealsByKitchen.get(m.kitchenId);
  if (arr) arr.push(m); else mealsByKitchen.set(m.kitchenId, [m]);
}
// inside the map:
const kMeals = mealsByKitchen.get(k.id) ?? [];
```

### Step 2: Group MTM meals by SCN once in `getMtmReporting`

Before `scns.map(...)`, build a Map keyed by `scnPartner` over the realized MTM
meals, and an active-member count Map; use lookups inside the loop instead of
`.filter`. Keep the exact same per-SCN computations (members, delivered7,
rollupMargin).

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Prove unchanged + gates

**Verify**: `npm test` → all pass (Plan 007's `getHeroStats`/`getFieldQueue`
tests plus any you add). If you want extra safety, add a `getActOnToday`/
`getMtmReporting` mocked-Prisma test asserting the same outputs before/after —
optional.
**Verify**: `npm run build` → exit 0. `npm run lint` → no new errors.

## Test plan

- Rely on Plan 007's mocked-Prisma query tests for regression safety. Optionally
  extend `tests/queries.test.ts` with a `getMtmReporting` case (mock
  `prisma.member.findMany` + `prisma.meal.findMany`) asserting per-SCN counts —
  recommended but not required.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0; `npm test` all pass; `npm run build` exit 0
- [ ] `npm run lint` no new errors
- [ ] `grep -n "mealsByKitchen" lib/queries.ts` → ≥2 matches
- [ ] No `.filter((m) => m.kitchenId === k.id)` remains
      (`grep -n "kitchenId === k.id" lib/queries.ts` → no matches)
- [ ] Only `lib/queries.ts` modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

Stop and report if:

- The loop excerpts don't match (drift).
- A query test result changes (the refactor altered behavior — revert and
  report).

## Maintenance notes

- If meals gain a many-to-many producer relationship later, the single-key Map
  grouping must be revisited.
- Reviewer: confirm the Map is built once outside the loop and that null
  `kitchenId` meals are handled (skipped) exactly as the old `.filter` did.
