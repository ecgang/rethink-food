# Demo Walkthrough Script (~90 seconds)

A tight narration for a Loom/screen-recording, written to land the specific signals
Rethink Food's posting screens for. Times are cumulative. Speak plainly; let the product carry it.

---

### 0:00 — Frame it (10s)
> "This is a working build of the **Rethink Command Center** — the real-time operating system
> from your posting. I scoped it on purpose to the six-month flagship plus the one AI workflow,
> and I'll show you what I deliberately left out and why."

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

### 0:45 — The field app (15s)
*(Click **Field App**.)*
> "This is the frontline operator view — installable on a phone. Tap a delivery, snap a proof
> photo, mark it delivered; verify the next one. Each action clears the matching 'Act on today'
> exception live, and the hero's verified-rate ticks up."

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

## Talking points if asked

- **Why these numbers are believable:** real NYC neighborhoods, real program/funder/SCN names,
  realistic cost ranges; anomalies are planted so the exception engine has something true to surface.
- **Data definitions:** one source of truth — `lib/margin.ts` and `lib/exceptions.ts` are pure and
  unit-tested; `lib/queries.ts` is the only adapter. See `docs/ARCHITECTURE.md`.
- **Build-vs-buy:** Vercel + serverless Postgres = one-command deploy, no infra to babysit.
- **What I'd do first at Rethink:** spend a week with kitchen + finance staff to validate that these
  definitions match how work actually happens before building more.
```
