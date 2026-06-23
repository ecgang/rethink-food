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
                              ├── /field/safety    — food-safety / QA checklists (SafetyCheck)
                              └── /field/incidents — incident log and resolution (Incident)
                              markProduced() closes PLANNED→PRODUCED (the only in-app lifecycle step
                              that was previously uncontrolled)
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
| **Incident** | A problem logged from the kitchen or field (food-safety, quality, delivery, equipment, or other). Carries `kind`, `severity` (LOW/MEDIUM/HIGH/CRITICAL), and `status` (OPEN/ACKNOWLEDGED/RESOLVED). Open HIGH/CRITICAL incidents surface as "act on today" exceptions and can spawn an `INCIDENT_NOTICE` draft. | `Incident` model, `lib/incidents.ts` |
| **SafetyCheck** | A food-safety or QA checklist result recorded in the field. Evaluated against required items plus an optional cold-holding temperature (FDA limit: 41°F). A recent failed check within 72h becomes an exception. | `SafetyCheck` model, `lib/safety.ts` |
| **Ask the Operating Layer** | Natural-language Q&A over partners/funders/contracts via bounded retrieval tools; every answer cites the records it used. | `lib/ai/retrieval/`, `AskLog` |
| **Today's briefing** | The exception feed narrated into a prioritized morning summary — severities come from the engine; the model only explains. | `lib/ai/briefing.ts`, `lib/briefing-board.ts` |
| **Missing info** | Pending intake requests whose required fields are absent or low-confidence — the trigger for a follow-up draft. | `lib/ai/missing-info.ts` |
| **Draft comm** | An AI-drafted follow-up (clarification / nudge / reconciliation / board narrative) in a `DRAFT → APPROVED/DISCARDED` queue. Never auto-sent. | `lib/ai/comms.ts`, `DraftComm` |

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
AskLog                         (Ask-the-Operating-Layer query log; no relations)
DraftComm                      (draft-and-approve comms queue; no relations)
Exception                      (computed live in lib/exceptions.ts; no DB table)

Kitchen 1──* Incident          (optional; incident may also link to Market or Meal)
Kitchen 1──* SafetyCheck       (optional; ties a check to the kitchen where it ran)
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
| `INCIDENT_OPEN` | incident is OPEN or ACKNOWLEDGED **and** severity is HIGH or CRITICAL | inherits the incident's own severity (HIGH or CRITICAL) |
| `SAFETY_CHECK_FAILED` | a failed check within the last 72h (`SAFETY_CHECK_RECENT_HOURS`) | HIGH for `FOOD_SAFETY`, MEDIUM for `QUALITY` |

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

## AI operating layer (narrate · draft · retrieve)

Intake above is one of the AI-operating-layer capabilities; the rest share one rule:
**the deterministic engines own every number — AI only narrates, drafts, and retrieves, and a
human approves anything that leaves the system.** It's enforced *structurally*: `lib/ai/*` cannot
import `lib/db` (only the isolated retrieval tools query Prisma), so a generator is incapable of
computing a figure. Each feature falls back to a deterministic path when `ANTHROPIC_API_KEY` is
absent. See ADRs 14–16 in `DECISIONS.md`.

- **Ask the Operating Layer** (`/ask`) — agentic tool-use over bounded Prisma queries (no
  embeddings). Each tool projects to a `Citation` through an explicit `select:` whitelist (PII like
  `Cbo.contactEmail` is never selected), so answers are exact, traceable, and link back to detail
  pages. Questions + cited answers are logged to `AskLog`.
- **Today's briefing** (home page) — narrates `detectExceptions()` into a prioritized summary;
  `filterToKnown` drops any item the model invents and copies severity straight from the engine.
  24h-cached (`lib/briefing-board.ts`), with manual regenerate via `updateTag`.
- **Draft-and-approve comms** (`/drafts`) — clarification / delivery-nudge / reconciliation /
  board-narrative drafts in a `DraftComm` queue. **No transport**: a human edits then approves or
  discards, and reviews join the `getAuditLog()` trail.

## Deliberate non-goals (scope discipline)

Not built, on purpose: multi-tenant auth/RBAC, inventory, donor self-serve reporting, and any
ML anomaly model. Each is real production work; none is needed to prove the thesis — *can this
person turn a messy food operation into software a CEO understands at a glance and an operator
acts on in seconds?* See the README for the full rationale.

Since shipped: a mobile-first `/field` operator PWA closing the produced→delivered→verified
loop — operators mark deliveries, capture proof photos, and verify receipts from any phone.
The hero metrics (`mealsTracked`, delivered this week, verified rate via `getHeroStats()`)
are computed live from the meal lifecycle, not static marketing figures.
