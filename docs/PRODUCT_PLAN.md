# Product Plan — From Dashboard to Operating System (A → B → C)

> Context: the current build reads beautifully but is **read-only** — numbers are
> dead ends. The JD wants a system you can *operate*: drill from any aggregate to
> the records behind it, take an action that changes state, and see the result.
> This plan adds the connective tissue, in three connected clusters that share
> the conventions below.

## Shared conventions (apply to all clusters)

- **Drill-down routes** live in the `(app)` group (sidebar chrome):
  `/meals/[id]`, `/contracts/[id]`, `/kitchens/[id]`, `/partners` + `/partners/[id]`,
  `/markets/[slug]` (slug = `borough-neighborhood`), `/meals` (records explorer).
- **Detail pages** show: the entity's identity, its related records, its live
  exceptions (reuse `detectExceptions`), and the **next available action** inline.
- **Actions reuse the live-derived pattern**: a mutation flips real state and
  `revalidatePath("/")`, so the matching "Act on today" exception clears itself.
- **Capabilities** (extend `lib/roles.ts`): `operate:field` (exists),
  `invoice:contract` (new — EXEC + FINANCE), `match:supply` (new — EXEC + OPS).
- **Money** stays integer cents; **all reads** go through `lib/queries.ts`.

## Cluster A — Make it operable (FIRST)

Fixes: "can't see what's happening," "nothing I can do," "Act on today should
drill down," "the delivery photo goes nowhere."

- `/meals/[id]` — lifecycle timeline (planned→produced→delivered→verified with
  timestamps + `deliveredBy`/`verifiedBy` + the **delivery photo**), cost line
  items, contract/funder/program/CBO/member; inline next action (Mark delivered /
  Verify) reusing the field server actions.
- `/contracts/[id]` — funder, program, budget, meals, billing status; **Generate &
  submit invoice** action → creates an `Invoice`, sets `Contract.lastInvoicedAt`
  → the `CONTRACT_BILLING_*` exception clears; lists past invoices.
- `/kitchens/[id]` — capacity, food cost vs budget, recent meals, its exceptions.
- `/meals` — records **explorer**: filter by program/kitchen/contract/status/date;
  rows link to `/meals/[id]`. KPI cards + funnel rows + Act-on-Today link into it.
- **Recent deliveries** proof feed (card on `/` + `/deliveries`): delivered/verified
  meals with photo thumbnails, operator, time → this is where the field photo lands.
- Act-on-Today rows become links to the entity; the recommended action becomes a
  real button on the detail page.

New schema: `Invoice` model + `enum InvoiceStatus`; `Contract.lastInvoicedAt`.
Exception change: `CONTRACT_BILLING_*` skips contracts invoiced within the cycle.

Acceptance: from `/`, click a CRITICAL "produced not delivered" → meal detail →
Mark delivered → return, exception is gone; click a billing exception → contract
→ Generate invoice → exception gone, invoice listed; a delivered meal's photo is
visible in Recent deliveries and on the meal timeline.

## Cluster B — Their real network, made legible (SECOND)

Fixes: "how did we incorporate their network," "map has no drill-down."

- `/partners` directory — the real ingested roster (Rethink Certified restaurants,
  kitchens, CBOs) with filters (type, borough, certified); rows → `/partners/[id]`.
- `/partners/[id]` — partner profile: market, capacity, certified flag, meals
  produced/received, margin, recent activity.
- **Map drill-down**: click a neighborhood → `/markets/[slug]` (or side panel)
  showing CBOs/kitchens/restaurants/members there, demand vs fulfilled, unmet, and
  a **Match capacity** action. Partners plotted on the map.

Acceptance: a reviewer can browse Rethink's actual partners, filter to Certified
restaurants, click one and see what it produces; click a high-unmet neighborhood
on the map and see who serves it + a next action.

## Cluster C — Marketplace loop + funder reporting (THIRD)

Fixes the 12-month flagship: end-to-end demand→funding→production→delivery→
verification→reporting.

- **Intake → production**: an APPROVED `IntakeRequest` becomes a scheduled,
  matched request (match a kitchen/restaurant with capacity in the CBO's market);
  generates upcoming meals. New `MealRequest` (or extend IntakeRequest) + match action.
- **Funder/donor impact report**: per-funder "what your support made possible" —
  meals funded/delivered/verified, margin, by program/market — with CSV export.
  Route `/funders/[id]/report` (or `/reports/funder/[id]`).

Acceptance: approve an intake request → it appears as matched demand → produces
meals into the lifecycle; open a funder report → see exactly what their contracts
paid for, exportable.

## Sequencing & verification

Execute A → B → C, deploying and checking in between each. Every cluster keeps
CI green (`npm run typecheck && npm test && npm run build`) and adds tests for new
pure logic (invoice period math, matching eligibility, report rollups).
