# Architecture & Data Definitions

> The job description asks the engineer to *"establish clear data definitions so that
> 'meal,' 'delivery,' 'cost,' 'revenue,' 'funding,' and 'impact' mean the same thing
> throughout the organization."* This document is that contract. The schema enforces it;
> the dashboard reports against it; nothing in the codebase computes "margin" a second,
> inconsistent way.

## System shape

```
 Browser ──HTTP──> Next.js 16 (App Router, RSC)
                      │
                      ├── Server Components ──> lib/queries.ts ──> Prisma ──> PostgreSQL
                      │                              │
                      │                              └─ pure domain core: lib/margin.ts, lib/exceptions.ts
                      │
                      ├── Server Actions (intake) ──> lib/intake.ts ──> Anthropic API (tool use)
                      │
                      └── Server Actions (field) ──> Prisma + Vercel Blob (delivery photos)
                              ↑
                        /field — mobile-first operator PWA (installable; sw.js service worker)
```

- **One source of truth for economics.** `lib/margin.ts` and `lib/exceptions.ts` are pure,
  dependency-free, and unit-tested. `lib/queries.ts` is the *only* place Prisma results are
  adapted into those functions. A reviewer can read the policy in one file.
- **Server-rendered, live data.** Dashboard pages are `force-dynamic`; every load reflects
  current data. No stale cached aggregates.
- **AI is a server action, not a backend service.** The model never writes to the DB; it
  returns a proposal that a human approves.

## Data dictionary

| Term | Definition in this system | Where it lives |
|---|---|---|
| **Meal** | One prepared meal for one recipient on one `mealDate`, moving through an explicit lifecycle. | `Meal` |
| **Lifecycle** | `PLANNED → PRODUCED → DELIVERED → VERIFIED`, each with its own timestamp. Status is denormalized for query speed but always derivable from the timestamps. | `Meal.status`, `*At` |
| **Delivery** | The `DELIVERED` transition (`deliveredAt`). Distinct from **verification** (`verifiedAt`), the partner's confirmation of receipt. | `Meal.deliveredAt`, `verifiedAt` |
| **Delivery proof** | Operator identity and optional photo captured in the field when a meal is marked DELIVERED or VERIFIED. | `Meal.deliveredBy`, `verifiedBy`, `deliveryPhotoUrl` (Vercel Blob URL) |
| **Cost** | The sum of a meal's **line items** (`FOOD`, `LABOR`, `TRANSPORT`, `OVERHEAD`). There is deliberately **no** flat `totalCost` column — cost is always composed. | `MealCostLineItem` |
| **Revenue** | Reimbursement earned per delivered meal, set by the meal's **Program**. | `Program.reimbursementRateCents` |
| **Contribution margin** | `revenue − cost`, per meal and aggregated. Can be negative. | `lib/margin.ts` |
| **Realized / billable** | A meal counts toward revenue & margin only once `DELIVERED` or `VERIFIED`. Planned/in-production meals are volume, not money. | `isRealized()` in `lib/queries.ts` |
| **Funding** | A **Funder** signs a **Contract** that funds a **Program**. MTM contracts also carry a Social Care Network (`scnPartner`). | `Funder`, `Contract` |
| **Impact (MTM)** | Active members, retention, delivered-vs-prescribed fulfillment, attributed by Social Care Network. | `getMtmReporting()` |
| **Exception** | A data condition an operator should act on, carrying a `reasonCode`, `severity`, and `recommendedAction`. | `lib/exceptions.ts` |

### Money
All monetary values are integer **cents** end to end. `lib/money.ts` is the single boundary
where cents become formatted dollars. No floats in the database, no rounding drift in rollups.

## Entities (Prisma → PostgreSQL)

```
Funder 1──* Contract *──1 Program
                │
Market 1──* Meal *──1 Contract
   │         │ │ └──* MealCostLineItem
   │         │ └──1 Program
   ├──* Kitchen ──* Meal      (producerType = KITCHEN)
   ├──* RestaurantPartner ──* Meal  (producerType = RESTAURANT)
   ├──* Cbo ──* Meal
   └──* Member ──* Meal       (MTM only)

IntakeRequest *──0..1 Cbo     (AI intake audit trail)
Exception                      (computed live in lib/exceptions.ts; no DB table)
```

## The exception engine (the "act on today" feed)

Deterministic rules, not ML — chosen on purpose: a hard threshold an operator can trust and
challenge beats a black box. Each rule is a tunable constant in `lib/exceptions.ts`:

| `reasonCode` | Trigger | Severity |
|---|---|---|
| `PRODUCED_NOT_DELIVERED` | produced > 24h, still not delivered | HIGH → CRITICAL at 48h |
| `DELIVERED_NOT_VERIFIED` | delivered > 48h, unconfirmed (billing risk) | MEDIUM |
| `KITCHEN_OVER_FOOD_BUDGET` | food cost/meal ≥ 20% over target | MEDIUM → HIGH at 40% |
| `KITCHEN_UNDER_CAPACITY` | producing < 60% of weekly capacity | LOW |
| `CONTRACT_BILLING_DUE` / `_OVERDUE` | invoice window ≤ 3 days / passed | HIGH / CRITICAL |

`now` is injected, so the rules are fully unit-testable (`tests/exceptions.test.ts`).

## AI intake (human-in-the-loop)

1. Operator pastes a free-text partner email.
2. `parseIntakeEmail()` calls Anthropic with a **forced tool call** (`submit_meal_request`),
   yielding structured fields **plus per-field confidence**. Output is validated with Zod.
3. The UI shows raw input ‖ extracted fields ‖ confidence. **Nothing is written yet.**
4. The operator approves or rejects; the decision is recorded in `IntakeRequest` with
   attribution (`approvedBy`) and the model used — a complete audit trail.
5. If `ANTHROPIC_API_KEY` is absent (or the model fails to call the tool), a deterministic
   parser takes over so the demo never hard-fails. The eval suite (`evals/intake.test.ts`)
   pins extraction accuracy.

This is the JD's "structured outputs, tool use, evaluations, guardrails, and human review"
in one screen.

## Deliberate non-goals (scope discipline)

Not built, on purpose: multi-tenant auth/RBAC, inventory, donor self-serve reporting, and any
ML anomaly model. Each is real production work; none is needed to prove the thesis — *can this
person turn a messy food operation into software a CEO understands at a glance and an operator
acts on in seconds?* See the README for the full rationale.

Since shipped: a mobile-first `/field` operator PWA closing the produced→delivered→verified
loop — operators mark deliveries, capture proof photos, and verify receipts from any phone.
The hero metrics (`mealsTracked`, delivered this week, verified rate via `getHeroStats()`)
are computed live from the meal lifecycle, not static marketing figures.
