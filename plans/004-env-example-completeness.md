# Plan 004: `.env.example` documents every env var the app actually reads

> **Executor instructions**: Follow step by step, verify each step, honor STOP
> conditions, and update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 20787e3..HEAD -- .env.example app/actions/field.ts`
> On mismatch with the excerpts below, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `20787e3`, 2026-06-21

## Why this matters

`.env.example` is the onboarding contract. It omits two variables the code now
depends on: `BLOB_READ_WRITE_TOKEN` (read in `app/actions/field.ts` to upload
field delivery photos) and `DATABASE_URL_UNPOOLED` (used for Prisma migrations
against Neon, per `CLAUDE.md`). A new developer following `.env.example` will
silently get no-op photo uploads and may hit migration errors against a pooled
connection. Documenting them — clearly marked optional vs. required — removes
that friction.

## Current state

- `.env.example` today:

```
# Copy to .env and fill in. Postgres runs in Docker on port 5433 (see README).
DATABASE_URL="postgresql://postgres:rethink@localhost:5433/rethink?schema=public"

# Anthropic API key for the AI intake workflow (/intake).
# Without it, the intake screen falls back to a deterministic parser.
ANTHROPIC_API_KEY=""

# Operator identity recorded in the AI-intake audit trail.
OPERATOR_NAME="Demo Operator"
```

- `app/actions/field.ts` reads `process.env.BLOB_READ_WRITE_TOKEN` and skips the
  photo upload (delivery still records) when it's absent.
- `CLAUDE.md` documents Neon reseeds via `DATABASE_URL=$DATABASE_URL_UNPOOLED`.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Build     | `npm run build`    | exit 0 (unaffected; sanity only) |

(There is no automated check for `.env.example`; correctness is by inspection.)

## Scope

**In scope** (only file to modify):
- `.env.example`

**Out of scope**:
- `.env` / `.env.local` — never commit or modify real env files; never print
  their values.
- Code that reads env vars — no code changes in this plan.

## Git workflow

- Branch: `advisor/004-env-example-completeness`
- One commit, e.g. `docs(env): document BLOB_READ_WRITE_TOKEN and unpooled URL`.

## Steps

### Step 1: Add the two missing variables with explanatory comments

Append to `.env.example` (do not alter the existing lines):

```
# Vercel Blob token for field-operator delivery photos (/field).
# OPTIONAL: without it, deliveries still record — the proof photo is just skipped.
# Provisioned automatically when you create a Blob store in the Vercel project.
BLOB_READ_WRITE_TOKEN=""

# Direct (unpooled) Postgres connection — used ONLY for Prisma migrations and
# seeding against Neon (pooled connections reject schema changes). For local
# Docker Postgres you can reuse the same value as DATABASE_URL.
DATABASE_URL_UNPOOLED="postgresql://postgres:rethink@localhost:5433/rethink?schema=public"
```

**Verify**: `grep -c "BLOB_READ_WRITE_TOKEN\|DATABASE_URL_UNPOOLED" .env.example`
→ `2`.

### Step 2: Sanity build

**Verify**: `npm run build` → exit 0 (this change does not affect the build; run
it only to confirm nothing else broke).

## Test plan

No automated test (documentation file). Verification is the grep in Step 1 plus
a read-through confirming each variable has a one-line purpose and an
optional/required marker. Do NOT put real secret values in the file — use empty
strings or the local Docker placeholder only.

## Done criteria

ALL must hold:

- [ ] `.env.example` contains `BLOB_READ_WRITE_TOKEN` with an "optional" note
- [ ] `.env.example` contains `DATABASE_URL_UNPOOLED` with a migration note
- [ ] No real credential values added (only empty strings / the existing local
      Docker placeholder)
- [ ] Only `.env.example` modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

Stop and report if:

- `.env.example` already contains these variables (drift — the gap was closed).
- You discover additional `process.env.X` reads not represented in
  `.env.example` (run `grep -rhoE "process\.env\.[A-Z_]+" app lib | sort -u`);
  if so, list them in your report so they can be added too.

## Maintenance notes

- Keep `.env.example` in sync whenever a new `process.env.*` read is introduced.
  Consider this the checklist item for any PR that adds an integration.
- Reviewer: confirm no real tokens were pasted (only placeholders).
