# Rethink Command Center

A working MVP of the **Rethink Command Center** — the real-time operating system described in
Rethink Food's *Lead Full-Stack Engineer* posting. Built as a focused demo of the role's core
thesis: *turn a complicated, real-world food system into software that a frontline operator can
act on in seconds and a CEO can understand at a glance.*

**▶ Live demo: https://rethink-food.ericgang.com**  ·  pages: [Command Center](https://rethink-food.ericgang.com/) · [AI Intake](https://rethink-food.ericgang.com/intake) · [Demand Map](https://rethink-food.ericgang.com/map)

> Demo build, not affiliated with Rethink Food. **Geography, restaurants, community partners,
> food-insecurity rates, and Social Care Networks are real** (NYC Open Data, Feeding America,
> NY 1115 waiver — see [Grounded in real NYC data](#grounded-in-real-nyc-data)). Meal-level
> volumes and costs are synthetic, generated against that real geography; partner↔Rethink
> associations are illustrative.

## What it does

**1. Command Center (`/`)** — the daily operating view.
- Meal lifecycle funnel: planned → produced → delivered → verified.
- Unit economics: line-itemed cost, reimbursement revenue, and **contribution margin sliced by
  program, kitchen, restaurant, contract, or market** (toggle).
- **"Act on today"** — an exception engine that surfaces what's wrong *right now* (meals stuck
  before delivery, deliveries unverified, a kitchen over food budget, a contract billing
  deadline overdue), each with a severity and a recommended action.
- Medically Tailored Meals program health: retention, delivered-vs-prescribed, Social Care
  Network attribution.

**2. AI Intake (`/intake`)** — a partner emails a free-text meal request; Claude extracts it into
a structured record with **per-field confidence**, an operator **approves or rejects** before
anything is written, and every decision is logged to an **audit trail**. Human-in-the-loop by
construction — the model never writes to the database.

**3. Demand Map (`/map`)** — meal demand vs. fulfilled capacity across NYC neighborhoods; the
first slice of the Network Marketplace.

## Why this slice (and what I deliberately cut)

The posting spans four product areas and explicitly screens for the judgment to *"distinguish an
essential workflow from an impressive but unnecessary feature"* and a *"bias toward shipping
rather than overengineering."* So this demo goes **narrow and deep** on the flagship six-month
deliverable (the Command Center) plus the one AI workflow that proves the AI-layer requirements,
and **cuts everything else on purpose**:

- ❌ Multi-tenant auth / RBAC — seeded single operator identity is enough to show attribution.
- ❌ Kitchen/field mobile ops, inventory, donor self-serve reporting — real, but not the thesis.
- ❌ An ML anomaly model — one set of transparent, tunable thresholds is more trustworthy than a
  half-trained black box, and an operator can argue with it.
- ❌ Infra beyond serverless Postgres + Vercel — a disciplined build-vs-buy call.

The cutting *is* the signal. Each non-goal is documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## How it maps to the role's milestones

| Posting milestone | In this demo |
|---|---|
| 6-mo: Command Center live — reliable meal volumes, unit economics, delivery & contract performance, exceptions, *without assembling spreadsheets* | The entire `/` dashboard |
| 12-mo: trusted operational **data foundation** with consistent definitions | Normalized schema + the data dictionary in `docs/ARCHITECTURE.md` |
| 12-mo: **demand map** MVP in one market | `/map` |
| AI layer: emails → structured workflows, structured outputs, evals, guardrails, human review | `/intake` + `evals/intake.test.ts` |

## Grounded in real NYC data

The demo isn't seeded with invented places — an ingestion pipeline (`npm run ingest`, scripts in `scripts/ingest/`) pulls real NYC open data, normalizes it, and commits the snapshots to `data/` so seeding is deterministic and offline-safe:

- **Neighborhoods + coordinates** — NYC Open Data *2020 Neighborhood Tabulation Areas* (`9nt8-h7nd`); centroids computed per NTA across all five boroughs.
- **Partner network** — Rethink Food's **actual published partners** ([their "A Network of Change" directory](https://www.rethinkfood.org/)): 35 restaurant partners (incl. 7 Rethink Certified — Manna's, Rob's Kitchen, Sophie's Cuban, Zaab Zaab…) and 52 community-based orgs (Henry Street Settlement, The Bowery Mission, North Brooklyn Angels, BronxWorks/RAP4Bronx, St. John's Bread & Life…), geocoded via the US Census geocoder.
- **Demand** — weighted by *Feeding America Map the Meal Gap* county food-insecurity rates (the Bronx is the most food-insecure county in NY).
- **Social Care Networks** — the actual NY 1115-waiver leads by borough: **PHS** (Manhattan/Brooklyn/Queens), **SOMOS** (Bronx), **SIPPS** (Staten Island).

Synthetic where it must be (meal-level costs, members) but always generated *against the real geography*. `minorityOwned` and partner↔Rethink associations are illustrative on real establishments — noted honestly.

## Trust, quality & accessibility

The hardest part of an operating system isn't the charts — it's that everyone believes the numbers.

- **One source of truth for metrics.** `lib/definitions.ts` defines meal / realized / cost / revenue / contribution-margin / fulfillment once; every view derives from the same pure functions, and the definitions are surfaced in-app (the "How these numbers are defined" panel on the dashboard).
- **Numbers that provably reconcile.** `tests/metrics.test.ts` is a contract test asserting that the sum of *every* slice (program, kitchen, market…) equals the headline total — so no two views can silently disagree. This is the *Reliable Data Foundation* pillar made enforceable.
- **Live momentum, not static figures.** KPI cards show period-over-period deltas (current 7d vs prior 7d).
- **Accessibility:** WCAG 2.2 AA pass — AA-contrast tokens, visible focus rings on every control, `role="img"` + descriptive labels on all charts, a keyboard-accessible text equivalent for the map, `aria-live` on the AI result, and `prefers-reduced-motion` support. Responsive down to mobile (sidebar collapses to icons).

## Deferred — on purpose (roadmap, not gaps)

Real production work, intentionally not built so the demo stays focused (the posting screens for *"essential workflow vs. impressive-but-unnecessary feature"*):

- **Full auth / SSO** — roles (Operations / Finance / Executive) are gated by capabilities (`can()`) enforced server-side in every write path, and the role cookie is **HMAC-signed** so it's tamper-evident (you can't hand-edit `rcc_role=EXEC` to unlock financials). What's *deliberately* open is role **selection** — there's no login wall, by demo choice, so you can click between roles. A real identity provider (NextAuth/SSO) swaps in behind the same `can()` checks; nothing else changes.
- **Live-model eval in CI** — the eval harness pins the deterministic parser today; add golden-fixture accuracy gating for the live model behind an API-key flag.
- **PII handling** — intake stores partner PII (`rawInput` / `extractedFields`), encrypted at rest by Neon; a pure input-safety screen (`screenIntakeInput`) runs before every model call to block injections and binary pastes, and an EXEC-only `deleteIntakeRequest` server action provides a right-to-erasure path (linked scheduled meals survive with a NULL back-reference). Production adds a configurable retention window and an LLM moderation pass (e.g. Model Armor) before the screen.
- **Source reconciliation** (HubSpot/CSV ingest → canonical schema → diff) and **mobile field-ops tools**.

## Stack

TypeScript · Next.js 16 (App Router, RSC + Server Actions) · PostgreSQL · Prisma · Tailwind v4 ·
Recharts · Leaflet · Anthropic SDK (tool use / structured output) · Vitest · GitHub Actions.

## Run locally

Prereqs: Node 20+, Docker (for Postgres).

```bash
# 1. Postgres
docker run -d --name rethink-pg -e POSTGRES_PASSWORD=rethink -e POSTGRES_DB=rethink \
  -p 5433:5432 postgres:16

# 2. Env
cp .env.example .env
#   - DATABASE_URL is preset for the container above
#   - add ANTHROPIC_API_KEY to use the live model on /intake
#     (without it, /intake falls back to a deterministic parser)

# 3. Install, migrate, seed (real-data snapshots are committed under data/)
npm install
npx prisma migrate dev
npm run db:seed
# optional: refresh the real NYC data snapshots from NYC Open Data
npm run ingest

# 4. Dev
npm run dev   # http://localhost:3000
```

## Verify

```bash
npm run typecheck   # tsc --noEmit
npm test            # Vitest: margin math, exception rules, intake evals
npm run build       # production build
```

- **Unit:** `tests/margin.test.ts`, `tests/exceptions.test.ts` — the economics and exception
  policy are pinned by tests (deterministic, `now` injected).
- **Evals:** `evals/intake.test.ts` — field-level extraction accuracy + low-confidence flagging.

## Deploy

Designed for **Vercel + Neon** (serverless Postgres): set `DATABASE_URL` and `ANTHROPIC_API_KEY`
in the Vercel project, then `prisma migrate deploy && npm run db:seed` against the Neon database.
`prisma generate` runs automatically on install/build.

## Project layout

```
app/                 routes: / (dashboard), /intake, /map
  intake/actions.ts  server actions: parse / approve / reject
components/          UI: hero band, marquee, kpi strip, charts, intake, map
lib/
  margin.ts          pure unit-economics core  (tested)
  exceptions.ts      pure "act on today" engine (tested)
  definitions.ts     canonical metric definitions (surfaced in-app)
  demand.ts          food-insecurity-weighted demand model
  facts.ts           real Rethink headline facts
  intake.ts          Anthropic tool-use parser + deterministic fallback
  queries.ts         the only Prisma → domain-core adapter
scripts/ingest/      NYC Open Data ingestion → data/*.json snapshots
data/                committed real-data snapshots (neighborhoods, restaurants, …)
prisma/schema.prisma the data model / definitions contract
prisma/seed.ts       seeds from data/ snapshots, planted anomalies
docs/ARCHITECTURE.md system shape + data dictionary
docs/DECISIONS.md    ADR-style rationale (build-vs-buy, scope, stack)
docs/DEMO_SCRIPT.md  90-second walkthrough script
```
