# Engineering Decisions (ADR log)

Plain-language rationale for the choices in this build — the kind of "translate
technical decisions for nontechnical leaders" record the role calls for. Each entry:
the decision, why, the tradeoff, and what would change it.

---

### 1. Scope: go deep on the Command Center + one AI workflow, not wide on all four product areas
**Why.** The posting screens explicitly for "distinguish an essential workflow from an impressive but unnecessary feature" and "bias toward shipping rather than overengineering." A shallow touch of all four areas would signal the opposite. The Command Center is the 6-month flagship; the AI intake proves the AI-layer requirements.
**Tradeoff.** No inventory or donor portal in the demo; field operator UX shipped as ADR 12.
**Revisit if.** A reviewer wants to see more field-ops depth beyond the delivery proof flow.

### 2. Frame the data around Medically Tailored Meals (Medicaid 1115 waiver)
**Why.** It's Rethink's newest, most reimbursement-driven, most audit-heavy program. Modeling Social Care Networks (PHS/SOMOS/SIPPS), delivered-vs-prescribed, and contract billing shows we understand their actual funding mechanics, not a generic food-bank dashboard.
**Tradeoff.** Some complexity (members, SCNs) that a pure surplus-rescue demo wouldn't need.

### 3. Deterministic exception engine, not an ML anomaly model
**Why.** An operator must trust and be able to challenge "what to act on today." Transparent thresholds with a reason code, severity, and recommended action beat a black box — and are unit-testable (`lib/exceptions.ts`, `tests/exceptions.test.ts`). The posting wants reliability and judgment, not ML for its own sake.
**Tradeoff.** Won't catch novel/correlated anomalies a model might.
**Revisit if.** Volume and labeled history justify a model — the rule engine becomes its baseline/guardrail.

### 4. A canonical metrics layer + a CI contract test
**Why.** The "Reliable Data Foundation" pillar is about everyone agreeing what a number means. `lib/definitions.ts` defines meal/cost/revenue/margin once; `tests/metrics.test.ts` asserts every slice reconciles to the headline total, so no two views can silently disagree. Almost no dashboard can *prove* its numbers agree.
**Tradeoff.** A little indirection vs. ad-hoc per-view queries.

### 5. Real NYC open data via an ingestion pipeline → committed snapshots
**Why.** Grounding the demo in real geography (NTA 2020 neighborhoods + centroids), real establishments (DOHMH inspections), and real need (Feeding America food-insecurity rates) signals "I know NYC" and demonstrates the "APIs / batch pipelines" requirement. Committing the normalized snapshots (`data/*.json`) keeps seeding deterministic and offline-safe — the build never depends on a live third-party API.
**Tradeoff.** Snapshots can go stale; `npm run ingest` refreshes them. `minorityOwned` isn't in the source, so it's a flagged synthetic field, and partner *associations* are illustrative on real establishments (stated in the README).
**Revisit if.** We need live freshness → schedule the ingest as a cron/webhook job.

### 6. Accuracy over plausibility: corrected SCNs and KPIs
**Why.** Earlier seed used PHS/HEALI/SOMOS; research showed HEALI serves **Long Island**, not NYC. Corrected to the real NYC leads — **PHS** (Manhattan/Brooklyn/Queens), **SOMOS** (Bronx), **SIPPS** (Staten Island) — assigned by borough. Refreshed headline facts to ~30M lifetime meals, 12 active CBOs, NYC + Miami. Getting verifiable facts right is the cheapest credibility.

### 7. Build-vs-buy: Vercel + serverless Postgres (Neon), not custom infra
**Why.** One-command deploy, managed backups, branch previews, zero servers to babysit — the right leverage for a small team. The posting names "disciplined build-versus-buy decisions and prevent unnecessary complexity."
**Tradeoff.** Vendor coupling; mitigated by standard Postgres + Prisma (portable).

### 8. Pin Prisma to v6 (not the newer v7)
**Why.** v7's driver-adapter/queryCompiler + ESM client and a client-output path that collides with Next's route scanner added risk for no demo benefit. Shipping reliably > newest version.
**Tradeoff.** Not on the latest major.

### 9. Money as integer cents end-to-end; line-itemed costs (no flat `totalCost`)
**Why.** No floating-point drift in financial rollups; cost is always composable into food/labor/transport/overhead — which is exactly what the unit-economics questions require.

### 10. Role-based access via a lightweight signer, not a login wall
**Why.** A login gate would block "click to explore" for an interview demo, but the role/permission/audit concepts still need to be demonstrated. So there's a cookie-backed role switch (Operations / Finance / Executive): it **gates financial views** (Operations sees lifecycle + intake but revenue/margin redact), **enforces `approve:intake` server-side** (Finance is read-only on intake), and **signs the audit trail** with the active operator identity. Same capability checks a real SSO/RBAC system would use — minus the wall.
**Tradeoff.** Not a real identity provider; roles are self-selected in the demo.
**Revisit if.** Real users/PII → back it with NextAuth/SSO; the `can()` checks stay.

### 11. Accessibility as a baseline (WCAG 2.2 AA)
**Why.** Frontline operators and executives include low-vision users; accessibility is product quality, not polish. AA-contrast tokens, visible focus rings, chart `role="img"` labels, a keyboard-accessible map equivalent, `aria-live` on AI results, reduced-motion support. The brand's bright green is used only as a *fill* with black/white text — never as text on a light surface — so the look and AA compliance coexist.

---

## Roadmap (deferred on purpose)
Hard auth + RBAC · live-model eval gating in CI · push aggregation to SQL/BigQuery at scale · HubSpot/Workspace/Slack source reconciliation · offline write queue for field app. Each is real production work; none is needed to prove the thesis.

---

### 12. Field operator PWA + Vercel Blob for delivery proof
**Why.** The produced→delivered→verified loop was incomplete without a field-facing tool. Operators needed to mark deliveries and capture proof photos from a phone, without installing a native app. A PWA (`/field`) reuses the existing Prisma layer and server actions — one codebase, one deploy, zero install friction. Delivery photos go to Vercel Blob; the public URL lands on `Meal.deliveryPhotoUrl`, degrading gracefully when no Blob token is configured.
**Tradeoff.** Vendor coupling to Vercel Blob; no offline write queue yet (network required to commit actions). The service worker (`public/sw.js`) provides an installable shell but does not buffer writes offline.
**Revisit if.** Field operators need to work in low-connectivity environments — add an offline write queue (e.g., IndexedDB + sync on reconnect).

### 13. Live operational hero metrics over static marketing numbers
**Why.** The hero band originally showed lifetime PR figures (~30M meals). These are accurate but don't reflect the live system state — they can't show whether the field loop is working today. Replacing them with `getHeroStats()` — meals tracked, delivered this week, verified rate — computes from the actual meal lifecycle and rises visibly when operators use the field app. A reviewer watching the demo can cause the verified-rate to tick up, proving the end-to-end loop is real.
**Tradeoff.** Week-scoped figures look smaller than lifetime totals; the seed data is sized to make them non-zero and meaningful in the demo context.
**Revisit if.** The hero band needs to show both operational and lifetime figures — add a toggle or a secondary stat row.
