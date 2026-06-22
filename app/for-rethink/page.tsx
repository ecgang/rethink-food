import type { Metadata } from "next";
import Link from "next/link";
import { HeroStatsRow } from "@/components/hero-band";

export const metadata: Metadata = {
  title: "Rethink Command Center — built for your Lead Full-Stack Engineer role",
  description:
    "A working demo of the Rethink Command Center — a human-reviewed AI operating layer, an installable field app, AI intake, and a network marketplace — built by Eric Gang for Rethink Food's Lead Full-Stack Engineer search, grounded in real NYC data.",
};

const REPO = "https://github.com/ecgang/rethink-food";
const ARCH = `${REPO}/blob/main/docs/ARCHITECTURE.md`;
const DECISIONS = `${REPO}/blob/main/docs/DECISIONS.md`;

const TOUR: { href: string; title: string; note: string; cta: string; badge?: string }[] = [
  {
    href: "/",
    title: "Command Center",
    note: "Meals planned → produced → delivered → verified, line-itemed unit economics, and contribution margin sliced by program, kitchen, contract, or market — plus an “act on today” exception engine. Use the role switcher (top-left) and watch financials redact for Operations.",
    cta: "Open the dashboard",
  },
  {
    href: "/ask",
    title: "AI operating layer",
    note: "A human-reviewed layer on top of the deterministic engines — the model narrates, drafts, and retrieves, but never computes a number. Ask plain-English questions and get cited answers that link to the real record; scan an AI “today’s briefing” of what needs action; and draft partner follow-ups, reconciliation notes, and a board narrative into an approve-or-discard queue that never auto-sends.",
    cta: "Ask the operating layer",
  },
  {
    href: "/intake",
    title: "AI Intake",
    note: "Paste a partner’s free-text email; Claude extracts a structured request with per-field confidence. An operator approves before anything is written — human-in-the-loop, with an input-safety guardrail and an eval harness behind it.",
    cta: "Try the intake",
  },
  {
    href: "/field",
    title: "Field operator app",
    badge: "Installable PWA",
    note: "A mobile-first companion to the Command Center: a frontline operator installs it to their phone’s home screen, taps a delivery, snaps a proof photo, and marks it delivered or verified. Each action clears the matching “act on today” exception live and ticks the verified-rate up — closing the produced→delivered→verified loop from the field.",
    cta: "Open the field app",
  },
  {
    href: "/map",
    title: "Demand Map → Marketplace",
    note: "Food-insecurity-weighted demand vs. fulfilled capacity across real NYC neighborhoods. Click a neighborhood to see who serves it and the unmet gap, then match a kitchen’s spare capacity into scheduled meals.",
    cta: "Explore the map",
  },
  {
    href: "/funders",
    title: "Funder impact + automated reports",
    note: "“What your support made possible” per funder — meals served, dollars delivered, neighborhoods reached — with CSV export and a weekly cron-generated snapshot under Reports.",
    cta: "See funder impact",
  },
  {
    href: "/audit",
    title: "Audit trail",
    note: "Every operator action — approvals, fulfillments, deliveries, invoices, and AI-draft reviews — attributed and timestamped. The “auditability” the posting asks for, made visible.",
    cta: "Open the audit log",
  },
];

function Arrow() {
  return <span aria-hidden className="inline-block translate-y-px">→</span>;
}

export default function ForRethinkPage() {
  return (
    <main className="min-h-full">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="bg-foreground text-background">
        <div className="mx-auto max-w-[1100px] px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-brand">
            A working demo · built for this role
          </p>
          <h1 className="mt-4 max-w-3xl font-display font-black leading-[0.95] tracking-tight text-[clamp(2.5rem,6vw,4.5rem)]">
            The Rethink<br />Command Center
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-background/80 sm:text-lg">
            I’m <span className="text-background">Eric Gang</span>. I built a working version of
            the operating system described in your <span className="text-background">Lead Full-Stack
            Engineer</span> posting — the Command Center, a <span className="text-background">human-reviewed
            AI operating layer</span>, an installable field app, and the network marketplace loop —
            grounded in <span className="text-brand">real NYC data</span>. This page is a short
            tour; everything it links to is live and clickable.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Enter the live Command Center <Arrow />
            </Link>
            <a
              href={REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-background transition-colors hover:border-white/60"
            >
              View the code <Arrow />
            </a>
          </div>

          <div className="mt-12 flex flex-wrap gap-x-12 gap-y-6">
            <HeroStatsRow
              stats={[
                { value: 279, label: "automated tests · CI-green" },
                { value: 87, label: "real NYC partners (restaurants + CBOs)" },
                { value: 3, label: "end-to-end product clusters shipped" },
              ]}
            />
          </div>
        </div>
      </section>

      {/* ── Annotated tour ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1100px] px-5 py-14 sm:px-8 sm:py-16">
        <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          A guided tour
        </h2>
        <p className="mt-2 max-w-2xl text-muted">
          Each surface is live, with what to look at. Click in, switch roles, ask the operating
          layer a question, paste an email, install the field app, run a match.
        </p>

        <ol className="mt-8 grid gap-4 sm:grid-cols-2">
          {TOUR.map((t, i) => (
            <li
              key={t.href}
              className="flex flex-col rounded-xl border border-border bg-surface p-5 shadow-sm"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-display text-sm font-black text-brand-deep tnum">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-lg font-bold tracking-tight">{t.title}</h3>
                {t.badge && (
                  <span className="ml-auto self-center rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-deep">
                    {t.badge}
                  </span>
                )}
              </div>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{t.note}</p>
              <Link
                href={t.href}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-deep hover:underline"
              >
                {t.cta} <Arrow />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Engineering story ────────────────────────────────────────── */}
      <section className="border-y border-border bg-brand-soft/40">
        <div className="mx-auto max-w-[1100px] px-5 py-14 sm:px-8 sm:py-16">
          <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            Built end-to-end, the way the posting describes the work
          </h2>
          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <div className="space-y-4 text-sm leading-relaxed text-foreground/90">
              <p>
                <span className="font-semibold">One person, the whole arc:</span> discovery →
                architecture → production → operation. It moves through the posting’s own story:
                <span className="font-semibold"> operate</span> (the Command Center) →
                <span className="font-semibold"> network</span> (partners, the demand map, supply
                matching) → <span className="font-semibold"> marketplace</span> (an approved intake
                request becomes scheduled meals, then funder reporting) — with a{" "}
                <span className="font-semibold">human-reviewed AI operating layer</span> (ask,
                briefing, drafting) woven across.
              </p>
              <p>
                <span className="font-semibold">A reliable data foundation.</span> Grounded in NYC
                Open Data (2020 Neighborhood Tabulation Areas), Rethink’s actual published partner
                roster, Feeding America food-insecurity rates, and the real NY 1115-waiver Social
                Care Networks. Canonical definitions live in one module so “meal,” “cost,”
                “revenue,” and “funding” mean the same thing throughout — enforced by a contract
                test that fails if any two views disagree.
              </p>
              <p>
                <span className="font-semibold">Production hygiene, not just a demo.</span> 279
                tests with CI (typecheck → lint → test → build), an HMAC-signed role cookie with
                server-side capability gates on every write, atomic scheduling, a{" "}
                <code className="rounded bg-foreground/[0.06] px-1 py-0.5 text-[0.8em]">/health</code>{" "}
                probe + structured logging, hardened CSV exports, and an AI input guardrail with
                human review.
              </p>
              <p>
                <span className="font-semibold">Build-vs-buy discipline.</span> Full SSO, four-system
                integrations, and an offline write-queue for the field app are deliberately{" "}
                <em>not</em> built — each a documented decision, because the role screens for
                shipping over overengineering.
              </p>
            </div>

            <div className="space-y-5">
              <div className="rounded-xl border border-border bg-surface p-5">
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Stack
                </h3>
                <p className="mt-2 text-sm leading-relaxed">
                  TypeScript · Next.js 16 (App Router, RSC + Server Actions) · installable PWA ·
                  PostgreSQL · Prisma · Neon · Tailwind v4 · Anthropic SDK (tool-use / structured
                  output / agentic retrieval — no vector DB) · Vitest · GitHub Actions · Vercel.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-5">
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                  Read deeper
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm">
                  <li>
                    <a className="font-semibold text-brand-deep hover:underline" href={REPO} target="_blank" rel="noopener noreferrer">
                      Source on GitHub <Arrow />
                    </a>
                  </li>
                  <li>
                    <a className="font-semibold text-brand-deep hover:underline" href={ARCH} target="_blank" rel="noopener noreferrer">
                      Architecture &amp; data dictionary <Arrow />
                    </a>
                  </li>
                  <li>
                    <a className="font-semibold text-brand-deep hover:underline" href={DECISIONS} target="_blank" rel="noopener noreferrer">
                      Decision log — every tradeoff, in plain language <Arrow />
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Honest scope ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1100px] px-5 py-14 sm:px-8 sm:py-16">
        <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          What’s real, and what’s a deliberate demo choice
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="font-display text-base font-bold">Real</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Geography, restaurants, community partners, food-insecurity rates, and the Social Care
              Networks are real (NYC Open Data, Feeding America, NY 1115 waiver). Meal-level volumes
              and costs are synthetic — generated <em>against</em> that real geography — and a few
              partner↔Rethink associations are illustrative. All noted honestly in the app.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="font-display text-base font-bold">Auth is intentional</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              The role cookie is HMAC-signed (tamper-evident), but role <em>selection</em> is open —
              no login wall — by demo choice, so you can switch between Operations / Finance /
              Executive and watch the permission model work live. SSO swaps in behind the same
              capability checks; nothing else changes.
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer / CTA ─────────────────────────────────────────────── */}
      <footer className="bg-foreground text-background">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-5 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <p className="font-display text-lg font-bold">
              Built by Eric Gang for Rethink Food’s Lead Full-Stack Engineer search.
            </p>
            <p className="mt-2 text-sm text-background/70">
              <a className="hover:text-background hover:underline" href={REPO} target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
              {" · "}
              <a className="hover:text-background hover:underline" href="mailto:hello@ericgang.com">
                hello@ericgang.com
              </a>
              {" · "}
              <a className="hover:text-background hover:underline" href="https://www.linkedin.com/in/ericgang" target="_blank" rel="noopener noreferrer">
                LinkedIn
              </a>
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink transition-colors hover:bg-white sm:self-auto"
          >
            Enter the live Command Center <Arrow />
          </Link>
        </div>
      </footer>
    </main>
  );
}
