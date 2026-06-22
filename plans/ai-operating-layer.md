# AI Operating Layer — Implementation Plan (v2, post-review)

**Status:** Plan only (no code written yet)
**Reviewed by:** Liotta (leverage/ROI), Linus (kernel-quality/security), Neo Architect (design/interfaces) — 2026-06-21.
**Author context:** Portfolio enhancement for the Rethink Food "AI-Enabled Operating Layer" JD.

> **v2 changelog (what the three reviews changed):**
> 1. **Re-sequenced:** build ④ *first* (it is the job title, demonstrated) — Liotta.
> 2. **② folded into the draft-and-approve pattern**, not a standalone cron-persisted feature. This simultaneously kills Liotta's "vanity feature" objection *and* Linus's Blocker 2 (unreviewed narrative leaking into a board/funder artifact).
> 3. **`lib/audit.ts` is read-only** (`getAuditLog()` reconstructs a trail from attribution columns). Corrected everywhere — no `logAudit()` exists. Audit now follows the *existing* column pattern, not a fictional writer.
> 4. **Committed to the `DraftComm` / `AskLog` migrations** — the persisted review queue *is* the JD's "human-reviewed agents." Dropped the no-migration hedging where it was making the demo worse.
> 5. **The "AI never computes a number" principle is now enforced structurally**, not by prompt wishes (dependency rule + structured-output validation).
> 6. **④ PII bound by explicit `select:` whitelists**, verified against existing detail pages (Linus Blocker 1 / Neo `Citation` projection).
> 7. Fixed `persistWeeklyReport(generatedBy: string)` signature, specified ③ cache TTL, split testable vs non-testable claims.

---

## Guiding principle (the interview thesis)

> AI is the **narration, drafting, and retrieval** layer on top of the deterministic ground-truth
> engines (`lib/margin.ts`, `lib/exceptions.ts`, `lib/definitions.ts`). **The LLM never computes a
> billable number** — it explains the number the engine computed, drafts the message a human approves,
> or retrieves the record a human asked for. Always cited, always human-reviewed, always degrading
> gracefully without an API key.

Two thesis-grade talking points the reviews surfaced — put these in the ADR:
- **"I didn't reach for RAG."** At this data scale (35 restaurants, ~dozens of CBOs/contracts — confirmed in `data/`), embeddings would be *contrarian-wrong*: they add an index to maintain, lose exact-match precision on IDs/names, and destroy the free-citation property. Bounded Prisma tools over <100 rows return in single-digit ms and every fact carries a record id.
- **The principle is enforced by the dependency graph, not by prompts** (see "Structural enforcement" below).

---

## Structural enforcement of the principle (do this or the thesis is just a wish — Linus + Neo)

1. **`lib/ai/*` must not import `lib/db`.** The narrate/briefing/comms generators take *already-computed
   typed data* (`WeeklyReportPayload`, `ExceptionItem[]`) and return prose. Being unable to reach the DB
   makes them *structurally incapable* of computing a number. The single exception is ④'s retrieval tools,
   isolated in `lib/ai/retrieval/` — the only AI module allowed to touch Prisma.
2. **③ uses tool-use with a strict schema** whose `reasonCode` enum is restricted to the values present in
   the input exception list. If the model returns a `reasonCode` not in the input → reject and fall back.
   Prompt instructions alone do not enforce this.
3. **② narratives are never auto-persisted** into a board/funder artifact. They are generated on demand,
   reviewed, edited, and only then exported (the draft-and-approve flow). No cron auto-writes prose.

---

## Shared infrastructure (build first)

### `lib/ai/client.ts`
- **Lazy-memoized** Anthropic singleton (intake currently `new`s a client per call — `lib/intake.ts:167`).
- `hasAnthropicKey()`, `getAnthropic()`, model constants:
  - `MODEL_FAST = "claude-haiku-4-5"` (narrate/brief/comms).
  - `MODEL_REASON = "claude-sonnet-4-6"` (④ agentic loop). Verify exact IDs via the `/claude-api` skill at build time.
- Central cost guards: `max_tokens` caps, default tool-round cap.

### `lib/ai/screen.ts`
- Extract pure `screenText(raw): {safe, reason}` + `capInput` from `lib/intake.ts:38–98`; `intake.ts` keeps its
  routing wrapper and re-imports the primitive (no behavior change).
- **Scope caveat (Linus):** this is a *pre-LLM gate* — it decides whether to call the model. It does **not**
  bound what the model does with tools afterward. ④'s safety comes from the tool field whitelists below, not from this.

### Audit (corrected — Liotta + Linus)
`lib/audit.ts` is **read-only** (`getAuditLog()` unions attribution columns from `IntakeRequest`/`Meal`/`Invoice`).
There is no writer. AI actions get their audit trail the **same way the rest of the app does**: the new
`DraftComm` / `AskLog` rows carry `status` + `reviewedBy` + `reviewedAt` columns, and `getAuditLog()` is
extended to union them in. No fictional `logAudit()`, no separate audit table.

### Migration policy (this env)
`prisma migrate dev`/`reset` are gated. Use `prisma migrate diff` → `prisma migrate deploy`; reseed Neon with
`DATABASE_URL=$DATABASE_URL_UNPOOLED npx prisma db seed`. We **commit** to two migrations: `DraftComm` (⑤) and
`AskLog` (④). When touching the `ReportKind` enum, also fix any exhaustive `switch` statements that will break at compile time.

---

## Sequencing (re-ordered — Liotta)

```
Shared infra (client.ts, screen.ts, audit union)
        │
        ├── ④ Ask the Operating Layer   ← BUILD FIRST: the thesis demo, the 90-second wow
        ├── ③ Morning Briefing          ← produces the missing-info detector
        │           │
        │           ▼
        └── ⑤ Comms Agent (+ DraftComm) ← consumes ③; ② folds in here as one more generator
```

`②` is no longer a standalone feature — it is `draftReportNarrative(payload)`, one generator inside ⑤'s pattern.

---

## Feature ④ — "Ask the Operating Layer"  *(BUILD FIRST — highest leverage)*

**JD bullet:** Search contracts, operating procedures, partner records, program history.

**Approach:** agentic structured retrieval over Prisma (no embeddings). Demo arc: ask → cited answer → click citation → land on the real record.

### Interface design (Neo) — projects to `Citation`, never raw models
```ts
interface RetrievalTool { name; description; input: ZodSchema; run(i): Promise<Citation[]> }
interface Citation { type: "partner"|"contract"|"funder"|"program"; id; label; fields: Record<string,…> }
```
- Each tool's `run()` is the **only** place a DB query lives. It uses an **explicit `select:`** projecting a
  whitelisted field set → PII is bounded at the tool boundary, not by prompt discipline.
- Synthesis sees `Citation[]` only → "only state facts tools returned" is structurally near-true; citations are
  first-class objects linkable to detail pages, not parsed from prose.

### PII field whitelist (Linus Blocker 1 — REQUIRED before coding)
Enumerate exactly which fields each tool returns; **every field must already appear on an existing detail page.**
Draft list (verify against `app/(app)/partners/...`, `/contracts/[id]`, `/funders/[id]` at build time):
- `search_partners(query)` → `{ id, name, borough, type }` only. **Never** `contactEmail`/address unless the
  detail page shows it. Search `Cbo.name` with `{ contains, mode: "insensitive" }`, `LIMIT 10`.
- `get_contract(id)` → `{ id, name, funderName, programName, budgetCents, billingDeadline, startDate, endDate }`.
- `list_contracts_for_funder(funder)` / `program_history(programId)` / `partner_meal_history(cboId)` →
  aggregate counts + dates only.
- **Hard rule:** no tool joins to `IntakeRequest` (holds `rawInput`/`extractedFields` PII — `schema.prisma:278–284`).

### Build steps
1. Route `app/(app)/ask/page.tsx` — question box + answer panel with citation chips → detail-page links.
2. `app/(app)/ask/actions.ts` → `askAction(question)`: `screenText()` first → `runToolLoop(question, tools, maxRounds=4)`
   on `MODEL_REASON` → synthesis prompt ("answer only from tool results; cite every fact; if nothing relevant, say you don't know").
3. **Fallback (no key):** keyword search → ranked record list, no synthesis.
4. **`AskLog` migration:** `{ id, question, answer, citations Json, modelUsed, reviewedBy?, createdAt }` — real audit trail + lets the demo show history.
5. SOP/policy docs don't exist → v1 covers structured records only; seed a few markdown SOPs + a `search_docs` tool as an optional follow-on. Note in the demo script.
6. Tests: each tool's `select:` whitelist (assert no PII field returned); bounded `LIMIT`; fallback keyword search; `screenText` rejects injection.

---

## Feature ③ — AI Morning Briefing  *(build #2 — feeds ⑤)*

**JD bullet:** anomalies, missing information, delivery risks, budget variances.
**What exists:** `detectExceptions()` (pure, `lib/exceptions.ts:66`) → severity-ranked `ExceptionItem[]` (`:8`); `getActOnToday()` wraps it with live DB; rendered on the home page.

### Build steps
1. `lib/ai/briefing.ts` → `generateBriefing(items: ExceptionItem[], kpiCtx)` (takes typed input, **no `lib/db` import**)
   → tool-use with a **schema whose `reasonCode` enum = the input's reason codes**; reject + fall back on any unknown code.
   Returns `{ summary, prioritized: {reasonCode, entityId, why, suggestedAction}[], modelUsed }`.
   **Fallback:** templated briefing from severity counts.
2. **Missing-information detector** `lib/ai/missing-info.ts` — deterministic scan of PENDING `IntakeRequest` rows
   whose `confidenceFlags` JSON has low/absent fields → "intake #X is missing {fields}." Becomes ⑤'s trigger source.
3. **Caching (Linus):** `generateBriefing` stays pure; wrap at the page boundary with `unstable_cache`,
   **TTL = 24h (or manual-regenerate-only) for MVP** — explicit, because there's no rate limiting yet. No `ReportKind`
   enum change in MVP (that path needs a migration + switch-statement audit).
4. UI (`app/(app)/page.tsx`): "Today's Briefing" card above the raw list; each item links to its entity and has a
   **"Draft follow-up"** button (→ ⑤). AI badge + timestamp + regenerate.
5. Tests: fallback reflects counts by severity; missing-info detector flags low-confidence pending intakes; briefing
   rejects a `reasonCode` not in input.

---

## Feature ⑤ — Draft-and-Approve Comms Agent  *(build #3 — absorbs ②)*

**JD bullet:** human-reviewed agents for intake, follow-up, reconciliation, and communication.
**Posture:** **never auto-sends.** No SMTP. The reviewable queue *is* the deliverable.

### `DraftComm` migration (committed — Liotta)
`{ id, kind, relatedEntityType, relatedEntityId, subject, body, status (DRAFT|APPROVED|DISCARDED), modelUsed,
generatedAt, reviewedBy?, reviewedAt? }`. `getAuditLog()` unions this in (the corrected audit story).

### Generators in `lib/ai/comms.ts` (typed entity in → `{subject, body}` out; deterministic mail-merge fallback)
- `draftIntakeClarification(intakeRequest)` — uses ③'s `confidenceFlags` to ask the CBO for exactly the missing fields.
- `draftDeliveryNudge(meal)` — for `PRODUCED_NOT_DELIVERED` / `DELIVERED_NOT_VERIFIED`.
- `draftReconciliationFlag(contract)` — for `CONTRACT_BILLING_DUE` / `KITCHEN_OVER_FOOD_BUDGET`.
- **`draftReportNarrative(payload: WeeklyReportPayload)` ← this is folded-in ②.** Same draft→edit→approve→export
  flow; narrative stored as a typed `narrative?: ReportNarrative` sub-object on `WeeklyReportPayload`, written
  **only after human approval** (resolves Linus Blocker 2 — nothing unreviewed ever lands in a funder/board artifact).
- Wire to `persistWeeklyReport(generatedBy: string)` (correct signature — *not* `identity`); the cron computes
  numbers only, never prose.

### Build steps
- Contextual "Draft follow-up" buttons on briefing items (③) and on intakes with missing info.
- Editable draft modal (reuse intake review styling) → Approve / Copy / Discard, each updating `DraftComm.status` + `reviewedBy`.
- Tests: each generator builds correct context; templated fallback; status transitions persist + appear in `getAuditLog()`.

---

## Verification gate & docs

- **CI green throughout:** `npm run typecheck` → `npm test` → `npm run build` (CI also runs `prisma generate`, Node 20).
- **Testability is split honestly (Linus):** *fallback determinism* and *tool `select:` whitelists* are unit-tested;
  *LLM numeric/citation fidelity* is **not** unit-testable — it's enforced at runtime by structured output + human
  review. The plan does not claim CI can catch a hallucinated number.
- **Success metrics (Liotta) — add to `docs/DEMO_SCRIPT.md`, one per feature:** e.g. "cited contract answer in one
  query vs digging 4 detail pages"; "CBO clarification drafted in ~2s vs ~8 min by hand." No before/after = no business case.
- `docs/DECISIONS.md` — ADR: AI-on-top principle + the two thesis talking points + the "DraftComm queue = human-review" decision.
- `docs/ARCHITECTURE.md` — data-dictionary entries for `DraftComm`, `AskLog`, the `narrative` payload sub-object.

## Out of scope (explicit)
SMTP/auto-send; embeddings/vector DB; ML anomaly detection (deterministic thresholds stay — explainability);
production rate limiting (documented TODO); LLM moderation pass (documented TODO).
