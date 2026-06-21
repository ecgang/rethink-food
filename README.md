# Rethink Command Center

A working MVP of the **Rethink Command Center** — the real-time operating system described in
Rethink Food's *Lead Full-Stack Engineer* posting. Built as a focused demo of the role's core
thesis: *turn a complicated, real-world food system into software that a frontline operator can
act on in seconds and a CEO can understand at a glance.*

**▶ Live demo: https://rethink-food.vercel.app**  ·  pages: [Command Center](https://rethink-food.vercel.app/) · [AI Intake](https://rethink-food.vercel.app/intake) · [Demand Map](https://rethink-food.vercel.app/map)

> Demo build with seeded, synthetic data. Not affiliated with Rethink Food. Organizational
> facts (MTM program, 1115 Medicaid waiver, Social Care Network partners) are drawn from public
> sources to make the demo realistic; all operational numbers are fabricated.

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

# 3. Install, migrate, seed
npm install
npx prisma migrate dev
npm run db:seed

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
components/          UI: sidebar, cards, charts, intake form, map
lib/
  margin.ts          pure unit-economics core  (tested)
  exceptions.ts      pure "act on today" engine (tested)
  intake.ts          Anthropic tool-use parser + deterministic fallback
  queries.ts         the only Prisma → domain-core adapter
prisma/schema.prisma the data model / definitions contract
prisma/seed.ts       realistic synthetic NYC data with planted anomalies
docs/ARCHITECTURE.md system shape + data dictionary
```
