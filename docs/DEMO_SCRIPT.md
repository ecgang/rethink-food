# Demo Walkthrough Script (~90 seconds)

A tight narration for a Loom/screen-recording, written to land the specific signals
Rethink Food's posting screens for. Times are cumulative. Speak plainly; let the product carry it.

---

### 0:00 — Frame it (10s)
> "This is a working build of the **Rethink Command Center** — the real-time operating system
> from your posting. I scoped it on purpose to the six-month flagship plus a **human-reviewed AI
> operating layer**, and I'll show you what I deliberately left out and why."

*(Land on `/`, the dashboard.)*

---

### 0:10 — The CEO glance (20s)
> "Top row is the business at a glance: billable meals, reimbursement revenue, and **contribution
> margin** — not just volume, actual unit economics. Margin per meal is **net of food, labor,
> transport, and overhead** — costs are line-itemed in the database, never a single guessed total."

*(Point at the four KPIs.)*

> "And this margin slicer flips the same numbers by **program, kitchen, restaurant, contract, or
> market** — the exact cuts a COO asks for."

*(Scroll to "Contribution margin per meal," click through 2–3 dimension tabs. Pause on the one where
Restaurant Response shows a negative bar.)*

> "Notice Restaurant Response runs at a **slight loss per meal** while MTM is healthy — that's the
> kind of thing that's invisible in spreadsheets and obvious here."

---

### 0:30 — The operator's "what do I do now" (20s)
*(Scroll back up to "Act on today.")*
> "This is the part I care most about. It's not a wall of charts — it's an **opinion**. Every item
> has a severity, a plain-language reason, **and a recommended action**: a contract billing window
> that's overdue, meals produced but not delivered, a kitchen running over food budget. An operator
> can act on the top item in seconds."

*(Hover the top CRITICAL row.)*

---

### 0:45 — The field app (30s)
*(Click **Field App**.)*
> "This is the frontline operator view — installable on a phone. Tap a delivery, snap a proof
> photo, mark it delivered; verify the next one. Each action clears the matching 'Act on today'
> exception live, and the hero's verified-rate ticks up."

*(Tap **Produce** on a planned meal.)*
> "This is the step that was invisible before: **marking a meal produced**. Previously the lifecycle
> jumped straight from planned to delivered — now the kitchen closes the `PLANNED → PRODUCED`
> transition explicitly, so in-production count is real."

*(Navigate to **Safety** — `/field/safety`.)*
> "Before a batch ships, the kitchen runs a **food-safety checklist**: cold-holding temp logged,
> handwashing, date-marking, allergen separation. The engine checks every required item against
> the FDA 41°F cold-holding limit. Pass or fail is recorded on `SafetyCheck` — a failed check
> within 72 hours surfaces immediately on the 'Act on today' feed."

*(Navigate to **Incidents** — `/field/incidents`. Log a CRITICAL food-safety incident.)*
> "If something's wrong — equipment failure, contamination risk — the operator logs an incident
> with kind and severity. A CRITICAL or HIGH incident lands in 'Act on today' the moment it's
> saved, and it shows up in the morning AI briefing. From the incident record you can draft a
> **partner notice** through the existing draft-and-approve queue — the comms loop from before,
> reused, not duplicated."

---

### 1:00 — The AI layer, done responsibly (25s)
*(Click **AI Intake**.)*
> "Your posting asks for AI that turns emails into structured workflows — with guardrails and human
> review. Here's a real partner email."

*(Click the "Recurring halal request" sample → **Parse with AI**.)*
> "Claude extracts it into a structured record with **per-field confidence**, and it resolved
> 'next Wednesday' to an actual date. But nothing's been written yet — **a human approves first.**"

*(Click **Approve & create**.)*
> "Approved, and it's logged to an **audit trail**: raw input, extracted fields, the model used, and
> who approved it. That's the structured-output, guardrail, and human-review story in one screen."

---

### 1:25 — The map + the close (15s)
*(Click **Demand Map**.)*
> "And the first slice of the marketplace: meal demand versus what we're actually fulfilling, by
> neighborhood — where to point funded capacity next."

> "What I **cut**: auth, inventory, an ML anomaly model. All real, none needed to prove the
> thesis — turn a messy food operation into software a CEO understands at a glance and an
> operator acts on in seconds. It's typed end-to-end, tested, and deploys on Vercel and Postgres.
> Happy to go deeper on the data model."

---

## Extended — the AI operating layer (+60s, if they want to see more)

The intake parser above is **one** of the JD's five "AI-enabled operating layer" bullets. The same
principle runs through all of them: **the model narrates, drafts, and retrieves — the deterministic
engines own every number, and a human approves anything that leaves the system.**

### Ask the Operating Layer (search → cited answer → click)
*(Click **Ask AI**, run "Which funders have the largest committed budgets?")*
> "Plain-English search over partners, funders, and contracts. Notice every fact is a **citation** —
> and clicking one drops me on the real record. There's no vector database here; the model calls
> bounded database queries, so answers are exact and traceable, and it never invents a number."

### Today's briefing (narrate the exceptions, don't replace them)
*(Back on `/`, point at the "Today's briefing" card above "Act on today.")*
> "This is the same exception engine from a minute ago, narrated into a morning briefing. The
> **severities and the items come from the deterministic engine** — the model only explains them and
> can't re-rank or fabricate. Each item has a **Draft follow-up** button."

### Draft-and-approve follow-ups (human-reviewed agents, never auto-send)
*(Click **Draft follow-up** on a flagged item → edit → **Approve**; then open **Draft Follow-ups**.)*
> "It drafts the clarification email — grounded in the real record — and **nothing sends**. I edit,
> approve or discard, and it's logged to the audit trail. On the Reports page the same flow drafts a
> **board narrative** from the live weekly totals, reviewed before it ever reaches a funder."

### What this buys an operator (illustrative estimates, not measured)

| Task | By hand today | With the operating layer |
|---|---|---|
| Find a contract's budget + dates | dig through 3–4 detail pages (~3–4 min) | one question, cited answer (~5s) |
| Triage what needs action this morning | read every exception, judge severity (~10 min) | scan a plain-English briefing (~30s) |
| Follow up on a partner missing info | spot the gap, write the email (~8 min) | drafted in ~2s, then edit + approve |
| Weekly board/funder narrative | write prose from the numbers (~20 min) | drafted from live totals, edit + approve |

> "That's the JD's thesis — reduce administrative work, keep a human in the loop — built as four
> features on one shared, fallback-safe AI layer."

---

## Talking points if asked

- **Why these numbers are believable:** real NYC neighborhoods, real program/funder/SCN names,
  realistic cost ranges; anomalies are planted so the exception engine has something true to surface.
- **Data definitions:** one source of truth — `lib/margin.ts` and `lib/exceptions.ts` are pure and
  unit-tested; `lib/queries.ts` is the only adapter. See `docs/ARCHITECTURE.md`.
- **Build-vs-buy:** Vercel + serverless Postgres = one-command deploy, no infra to babysit.
- **What I'd do first at Rethink:** spend a week with kitchen + finance staff to validate that these
  definitions match how work actually happens before building more.
```
