# Plan 013: Bring the docs current with the field PWA, audit columns, and live hero metrics

> **Executor instructions**: Follow step by step, verify each step, honor STOP
> conditions, update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 20787e3..HEAD -- docs/ARCHITECTURE.md docs/DEMO_SCRIPT.md docs/DECISIONS.md`
> On material mismatch with the excerpts, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: coordinate with plans/011 (both edit `docs/ARCHITECTURE.md`,
  different sections — land 011 first if doing both, or merge carefully)
- **Category**: docs
- **Planned at**: commit `20787e3`, 2026-06-21

## Why this matters

Three shipped features are absent or contradicted in the docs: the `/field`
operator PWA, the new `Meal` audit columns (`deliveredBy`, `verifiedBy`,
`deliveryPhotoUrl`), and the live operational hero metrics. Worse, the docs
actively say these were *cut*: `ARCHITECTURE.md` lists "kitchen/field mobile ops"
under "Deliberate non-goals" and `DEMO_SCRIPT.md` says "What I cut: ... mobile
field tools." Stale-and-wrong docs are worse than missing ones — for a portfolio
artifact a reviewer reads, this is a credibility bug.

## Current state

- `docs/ARCHITECTURE.md`:
  - Data dictionary (~lines 31–42): has a **Delivery** row citing
    `Meal.deliveredAt, verifiedAt` but NOTHING for `deliveredBy`, `verifiedBy`,
    `deliveryPhotoUrl`.
  - System-shape diagram (~lines 11–19): shows Server Components → queries and
    Server Actions (intake) → Anthropic; no `/field` route or Vercel Blob.
  - "Deliberate non-goals" (~line 97): "Not built, on purpose: multi-tenant
    auth/RBAC, **kitchen/field mobile ops**, inventory, donor self-serve
    reporting, and any ML anomaly model."
- `docs/DEMO_SCRIPT.md`:
  - No `/field` beat (covers `/`, `/intake`, `/map`).
  - Close (~line 66): "What I **cut**: auth, inventory, **mobile field tools**, an
    ML anomaly model."
- `docs/DECISIONS.md`: ADRs 1–11; no ADR for the field PWA + Vercel Blob, and
  none for replacing static marketing numbers with live hero metrics.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Build (sanity) | `npm run build` | exit 0 (docs don't affect build) |

(Docs correctness is verified by inspection + the greps in Done criteria.)

## Scope

**In scope**:
- `docs/ARCHITECTURE.md` (data dictionary rows, system-shape diagram, non-goals)
- `docs/DEMO_SCRIPT.md` (add a field beat, fix the "cut" list)
- `docs/DECISIONS.md` (add ADR 12 + ADR 13)

**Out of scope**:
- The `ARCHITECTURE.md` line about the `Exception` table — owned by Plan 011. Do
  not edit it here.
- Any code changes — this is documentation only.

## Git workflow

- Branch: `advisor/013-refresh-docs-for-field-and-metrics`
- One commit, e.g. `docs: document field PWA, audit columns, and live hero metrics`.

## Steps

### Step 1: Update the ARCHITECTURE data dictionary + system shape

- Add rows to the data dictionary for the audit columns, e.g.:
  - `**Delivery proof** | Operator identity and optional photo captured in the field when a meal is marked DELIVERED / VERIFIED. | Meal.deliveredBy, verifiedBy, deliveryPhotoUrl (Vercel Blob URL)`
- In the system-shape diagram, add the field app and Blob, e.g. a line:
  `└── Server Actions (field) ──> Prisma + Vercel Blob (delivery photos)` and note
  the `/field` installable PWA route.

### Step 2: Fix the "non-goals" so it no longer claims field tools were cut

In `ARCHITECTURE.md`'s "Deliberate non-goals", remove "kitchen/field mobile ops"
from the cut list and instead note it as **built**: e.g. add a short line above
or below — "Since shipped: a mobile-first `/field` operator PWA closing the
produced→delivered→verified loop." Keep the other genuine non-goals.

### Step 3: Add a field beat to the demo script + fix the close

- Insert a ~15–20s beat (e.g. at `0:45`, before or after the AI layer):
  "Click **Field App**. This is the frontline operator view — installable on a
  phone. Tap a delivery, snap a proof photo, mark delivered; verify the next one.
  Each action clears the matching 'Act on today' exception live, and the hero's
  verified-rate ticks up."
- In the close, change "What I **cut**: auth, inventory, mobile field tools, an
  ML anomaly model." → drop "mobile field tools" (it now exists), keep the rest.

### Step 4: Add ADR 12 and ADR 13 to DECISIONS.md

Append two short ADRs in the existing numbered style:

- **12. Field operator PWA + Vercel Blob for delivery proof.** Installable
  mobile-first `/field` route (own chrome, offline shell via a hand-rolled
  service worker), reusing the existing Prisma layer + server actions; delivery
  photos go to Vercel Blob (public URL on `Meal.deliveryPhotoUrl`), degrading
  gracefully when no token is configured. Why PWA over native: one codebase/
  deploy, zero install friction. Tradeoff: vendor coupling to Blob; no offline
  write queue yet.
- **13. Live operational hero metrics over static marketing numbers.** The hero
  shows meals tracked / delivered this week / verified rate computed from the
  meal lifecycle (`getHeroStats`), not lifetime PR figures — so the headline
  reflects the live system and the field loop's effect.

### Step 5: Sanity build

**Verify**: `npm run build` → exit 0 (unchanged; confirms nothing else broke).

## Test plan

No automated tests (documentation). Verification is the greps below plus a
read-through confirming the docs match shipped behavior (field PWA exists, audit
columns exist, hero is live).

## Done criteria

ALL must hold:

- [ ] `grep -n "deliveryPhotoUrl" docs/ARCHITECTURE.md` → ≥1 match
- [ ] `grep -in "field" docs/DEMO_SCRIPT.md` → ≥1 match (a field beat exists)
- [ ] `grep -n "mobile field tools" docs/DEMO_SCRIPT.md` → no match (cut-list fixed)
- [ ] `grep -nE "^### 12\.|^### 13\." docs/DECISIONS.md` → 2 matches
- [ ] `docs/ARCHITECTURE.md` non-goals no longer lists field/kitchen mobile ops as cut
- [ ] Only the three doc files modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

Stop and report if:

- The doc sections differ materially from the excerpts (drift).
- Plan 011 has already reworded the same ARCHITECTURE lines and a merge conflict
  is unclear — coordinate rather than guess.

## Maintenance notes

- Keep DECISIONS.md the source of truth for "why"; when a future feature lands,
  add an ADR rather than letting the non-goals list drift again.
- Reviewer: read the docs as the hiring reviewer would — confirm nothing claims a
  shipped feature was cut.
