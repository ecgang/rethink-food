# Plan 011: Remove the unused `Exception` model + `Severity` enum and reconcile the docs

> **Executor instructions**: Follow step by step, verify each step, honor STOP
> conditions, update this plan's row in `plans/README.md` when done. This plan
> changes the database schema and generates a migration — read the STOP
> conditions before starting.
>
> **Drift check (run first)**: `git diff --stat 20787e3..HEAD -- prisma/schema.prisma prisma/seed.ts docs/ARCHITECTURE.md`
> On material mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (the table is empty and unused) — but it is a destructive
  migration; see STOP conditions.
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `20787e3`, 2026-06-21

## Why this matters

The Prisma `Exception` model and its `Severity` enum are dead: `getActOnToday`
computes exceptions live from meal state via `lib/exceptions.ts` and nothing ever
reads or writes the `Exception` table (the only reference is `seed.ts` clearing
it). The TypeScript `Severity` used throughout the UI is a **separate plain union
in `lib/exceptions.ts`** — it does NOT come from Prisma — so removing the Prisma
enum has zero code impact. Removing the dead model and reconciling the
architecture doc (which currently calls the table "reserved for persistence")
eliminates schema drift and a false "exceptions are persisted" assumption.

## Current state

- `prisma/schema.prisma`:
  - `enum Severity { LOW MEDIUM HIGH CRITICAL }` (~lines 65–70) — referenced ONLY
    by the Exception model below.
  - `model Exception { id ... severity Severity ... detectedAt resolvedAt
    @@index([severity]) @@index([resolvedAt]) }` (~lines 264–277), with a
    comment header above it.
- `prisma/seed.ts:87` — `await prisma.exception.deleteMany();` (the only code
  reference to the model anywhere).
- `lib/exceptions.ts:6` — `export type Severity = "LOW" | "MEDIUM" | "HIGH" |
  "CRITICAL";` (the union the UI imports — KEEP this).
- `docs/ARCHITECTURE.md`:
  - Entities diagram line ~62: `Exception  (computed live; table reserved for persistence)`.
  - Data-dictionary row ~42: `**Exception** | A data condition... | lib/exceptions.ts`
    (this points at the engine, not the table — it can stay, optionally reworded).

Verification that the model is truly dead (run these — all must hold):
- `grep -rn "prisma.exception\." app lib prisma` → only `prisma/seed.ts:87`.
- `grep -rn "from \"@prisma/client\"" lib components app | grep -i Severity` → no matches.

## Commands you will need

| Purpose            | Command | Expected |
|--------------------|---------|----------|
| Generate migration | `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` | prints `DROP TABLE "Exception"` (and `DROP TYPE "Severity"`) |
| Apply (local)      | `npx prisma migrate deploy` | applies the new migration |
| Generate client    | `npx prisma generate` | exit 0 |
| Typecheck/test/build | `npm run typecheck` / `npm test` / `npm run build` | pass |

(Requires a local Postgres on the `DATABASE_URL` in `.env` — Docker on :5433.
`migrate dev`/`migrate reset` are gated in this repo; use the diff→deploy flow
exactly as the existing migrations were authored.)

## Scope

**In scope**:
- `prisma/schema.prisma` (remove `model Exception` + `enum Severity` + their
  comment header)
- `prisma/migrations/<timestamp>_remove_exception_model/migration.sql` (create
  via diff)
- `prisma/seed.ts` (remove the `prisma.exception.deleteMany()` line)
- `docs/ARCHITECTURE.md` (reconcile the line that calls the table "reserved for
  persistence")

**Out of scope**:
- `lib/exceptions.ts` — its `Severity` union and `detectExceptions` stay exactly
  as-is. Do NOT touch the exception ENGINE.
- Deploying the migration to production (Neon) — that is the operator's step;
  do not push or run prod deploys.

## Git workflow

- Branch: `advisor/011-remove-dead-exception-model`
- One commit, e.g. `chore(schema): drop unused Exception model and Severity enum`.

## Steps

### Step 0: Confirm the table is empty and unused (precondition)

Run the two `grep`s in "Current state". Then confirm zero rows (the demo never
writes any): start the app's DB and run, via a throwaway script or psql,
`SELECT count(*) FROM "Exception";` → expect `0`. If you cannot run SQL, at
minimum confirm no code path writes the table (the grep proves it).

If the table has rows OR any `prisma.exception.create/update` exists → **STOP**.

### Step 1: Remove the model and enum from the schema

Delete from `prisma/schema.prisma`: the `model Exception { ... }` block, the
`enum Severity { ... }` block, and the comment header introducing the
"Exceptions" section. Save.

### Step 2: Remove the seed reference

Delete line `await prisma.exception.deleteMany();` from `prisma/seed.ts`.

**Verify**: `grep -rn "exception" prisma/seed.ts` → no matches (case-insensitive
check for `prisma.exception`).

### Step 3: Generate and apply the migration

```
TS=$(date +%Y%m%d%H%M%S)
DIR="prisma/migrations/${TS}_remove_exception_model"
mkdir -p "$DIR"
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > "$DIR/migration.sql"
cat "$DIR/migration.sql"   # expect DROP TABLE "Exception"; and DROP TYPE "Severity";
npx prisma migrate deploy
npx prisma generate
```

**Verify**: `migrate deploy` reports the new migration applied; `prisma generate`
exits 0.

### Step 4: Reconcile the architecture doc

In `docs/ARCHITECTURE.md`, change the entities-diagram line that reads
`Exception  (computed live; table reserved for persistence)` to reflect reality,
e.g. `Exceptions are computed live in lib/exceptions.ts (not persisted).`
Optionally reword the data-dictionary Exception row's "Where it lives" to
`lib/exceptions.ts (computed, not stored)`. Do not remove the row.

### Step 5: Gates

**Verify**: `npm run typecheck` → exit 0 (the UI's `Severity` union is
unaffected). `npm test` → all pass. `npm run build` → exit 0. `npm run lint` →
no new errors.

## Test plan

No new unit tests (removal). Regression safety: the existing
`tests/exceptions.test.ts` (the live engine) must still pass unchanged, proving
the engine — the thing that actually matters — is untouched.

## Done criteria

ALL must hold:

- [ ] `grep -rn "model Exception\|enum Severity" prisma/schema.prisma` → no matches
- [ ] `grep -rn "prisma.exception" prisma app lib` → no matches
- [ ] A new migration dir exists under `prisma/migrations/` with `DROP TABLE "Exception"`
- [ ] `npx prisma generate` exits 0; `npm run typecheck` exits 0
- [ ] `npm test` all pass (including `tests/exceptions.test.ts`)
- [ ] `npm run build` exits 0; `npm run lint` no new errors
- [ ] `docs/ARCHITECTURE.md` no longer says the table is "reserved for persistence"
- [ ] Only the in-scope files modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

Stop and report (do not improvise) if:

- `SELECT count(*) FROM "Exception"` returns > 0, or any
  `prisma.exception.create/update/upsert` exists (the model is NOT dead — Plan
  013's docs or a future feature may intend persistence; revisit before dropping).
- The migration SQL drops anything OTHER than the `Exception` table and
  `Severity` type (drift — unexpected schema changes).
- `npm run typecheck` fails after removal (something imported `Severity` from
  `@prisma/client` after all — keep the enum and report).

## Maintenance notes

- This migration must also be applied to production (Neon) via
  `prisma migrate deploy` with the production `DATABASE_URL_UNPOOLED` — that is
  the operator's deploy step, intentionally NOT done by this plan.
- If exception *history* is wanted later (a real product feature — see the
  direction options), reintroduce a persistence model WITH a writer and a
  consumer, not as a reserved-but-empty table.
- Reviewer: confirm `lib/exceptions.ts` and `tests/exceptions.test.ts` are
  untouched and the live "act on today" feed still renders.
