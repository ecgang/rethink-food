# Plan 012: Verify chart bundle cost, then defer charts within the dashboard (only if it helps)

> **Executor instructions**: Follow step by step. This plan begins with a
> MEASUREMENT step that may conclude the work is not worth doing — if so, mark it
> REJECTED in `plans/README.md` with the evidence and stop. Honor STOP
> conditions. Update this plan's row when done.
>
> **Drift check (run first)**: `git diff --stat 20787e3..HEAD -- app/(app)/page.tsx components/charts.tsx`
> On material mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `20787e3`, 2026-06-21
- **Confidence the work is needed**: LOW — the premise is likely false (see below).

## Why this matters

An audit flagged that Recharts (`components/charts.tsx`, a `"use client"` module
importing `BarChart`, `PieChart`, etc.) might be shipped on every route in the
`(app)` group. **This is probably NOT true**: Next.js App Router code-splits
client components per route, and `charts.tsx` is imported only by
`app/(app)/page.tsx` (the dashboard) — not by `/map`, `/intake`, or `/field`. So
Recharts is most likely already isolated to the dashboard route's bundle. This
plan exists to *measure* that and, only if a real win remains, defer the charts
so the dashboard's KPIs/act-on-today paint before the chart JS hydrates.

## Current state

- `app/(app)/page.tsx:7` — static import:
  `import { LifecycleFunnel, CostDonut, MarginBars } from "@/components/charts";`
- `components/charts.tsx:1` — `"use client"`, imports the Recharts pieces.
- `components/map-panel.tsx:8` — the in-repo pattern for deferring a heavy client
  lib (Leaflet) via `next/dynamic` from inside a `"use client"` component:
  `const DemandMap = dynamic(() => import("@/components/demand-map"), { ssr: false, loading: ... })`.
  Note: `ssr: false` is only allowed inside a Client Component, NOT in the RSC
  `page.tsx`.

## Commands you will need

| Purpose | Command | Expected |
|---------|---------|----------|
| Build (measure) | `npm run build` | exit 0; prints per-route "First Load JS" |
| Typecheck | `npm run typecheck` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | no new errors |

## Scope

**In scope** (only if Step 1 shows a real win):
- `app/(app)/page.tsx`
- `components/charts.tsx` (or a new tiny `components/charts-deferred.tsx` client
  wrapper, if needed to use `ssr: false`)

**Out of scope**: `/map`, `/intake`, `/field` and their components; any change to
chart visuals or data; adding chart libraries.

## Steps

### Step 1: MEASURE — is Recharts actually shared across routes?

Run `npm run build` and record the "First Load JS" for `/`, `/map`, `/intake`,
`/field` from the route table. Then check which route chunks reference recharts:

```
npm run build
grep -rl "recharts" .next/static/chunks 2>/dev/null | head
```

Decision:
- **If Recharts only appears in the dashboard (`/`) chunk** (expected): the
  original premise is false. There is no cross-route win. STOP and mark this plan
  **REJECTED** in `plans/README.md` with one line: "recharts is route-isolated to
  `/` — no cross-route bundle cost; verified at build." You are done.
- **If Recharts appears in a shared/framework chunk loaded by `/field` or `/map`**:
  proceed to Step 2.

### Step 2 (only if warranted): Defer the charts within the dashboard

Because `page.tsx` is a Server Component, create a small `"use client"` wrapper
`components/charts-deferred.tsx` that does the `next/dynamic` import with
`ssr: false` and a lightweight `loading` placeholder (mirror
`components/map-panel.tsx`'s pattern), exposing `LifecycleFunnel`, `CostDonut`,
`MarginBars`. Then import those from the wrapper in `page.tsx` instead of from
`@/components/charts`.

Keep the same props and JSX usage. The charts will hydrate after the initial
server-rendered KPIs/act-on-today.

**Verify**: `npm run typecheck` → exit 0; `npm run build` → exit 0; the dashboard
still renders all three charts (`npm run dev`, open `/`).

### Step 3: Gates

**Verify**: `npm test` → all pass; `npm run lint` → no new errors.

## Test plan

No unit tests (bundling/UX). Verification is the build measurement (Step 1) and,
if Step 2 runs, a manual confirmation that `/` still shows the lifecycle funnel,
cost donut, and margin bars.

## Done criteria

ONE of:

- [ ] Step 1 showed route isolation → plan marked **REJECTED** in
      `plans/README.md` with the build evidence, no code changed; OR
- [ ] Step 2 applied → `npm run build`/`typecheck`/`test`/`lint` all green, charts
      still render on `/`, only in-scope files modified, `plans/README.md` updated.

## STOP conditions

Stop and report if:

- `ssr: false` is used (incorrectly) directly in `page.tsx` and Next errors —
  move it into a Client Component wrapper.
- Deferring the charts causes a layout shift or hydration error you can't
  resolve quickly — revert and mark the plan rejected with the reason.

## Maintenance notes

- This is a deliberately low-confidence plan; "not worth doing" is an acceptable
  and likely outcome. Record the measurement so it isn't re-audited.
- Reviewer: if Step 2 shipped, confirm no visual regression on the dashboard.

## Verdict (2026-06-21): REJECTED — premise false, no code change

Measured against a production build. The premise ("Recharts shipped on every
route") is false:

- `components/charts.tsx` is the only Recharts consumer (a `"use client"`
  component) and is imported by exactly one route: `app/(app)/page.tsx` (`/`).
- The emitted Recharts chunk (`.next/static/chunks/1i6qvbtgtbm11.js`, ~356 KB
  raw) is referenced **only** by `(app)/page_client-reference-manifest.js` — no
  other route's client-reference manifest mentions it. App Router already
  code-splits it to the home route; `/map`, `/meals`, `/field`, etc. never load it.

Deferring with `next/dynamic({ ssr: false })` would only move the chart JS off
the home route's initial bundle in exchange for dropping SSR of the charts (a
client-side load + layout flash) on the flagship route — and it already streams
behind Suspense skeletons. Net: no cross-route benefit, a worse first paint on
the one route that uses charts. Not worth doing.
