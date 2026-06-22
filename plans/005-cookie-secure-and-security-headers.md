# Plan 005: Harden the role cookie and add baseline security response headers

> **Executor instructions**: Follow step by step, verify each step, honor STOP
> conditions, update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 20787e3..HEAD -- app/actions/role.ts next.config.ts`
> On mismatch with excerpts below, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `20787e3`, 2026-06-21

## Why this matters

Two baseline web-hardening gaps. (1) The `rcc_role` cookie is set `httpOnly` +
`sameSite: "lax"` but without `Secure`, so on production HTTPS it lacks the flag
that prevents transmission over plaintext. (2) `next.config.ts` sets only the
service-worker cache headers — there are no baseline response headers
(`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`). These are
cheap, standard defense-in-depth. (Note: per ADR 10 the app intentionally has no
login wall — that is by design and out of scope here; this plan only adds
standard transport/headers hygiene.)

## Current state

- `app/actions/role.ts` — sets the role cookie:

```ts
const store = await cookies();
store.set(ROLE_COOKIE, role, {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 30,
});
```

- `next.config.ts` — current `headers()` only covers `/sw.js`:

```ts
async headers() {
  return [
    {
      source: "/sw.js",
      headers: [
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      ],
    },
  ];
},
```

The app uses Leaflet (OpenStreetMap tiles), Recharts, and renders Vercel Blob
image URLs — relevant if a Content-Security-Policy is added later.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npm run typecheck`| exit 0              |
| Build     | `npm run build`    | exit 0 (`DATABASE_URL` set) |
| Lint      | `npm run lint`     | no new errors       |

## Scope

**In scope**:
- `app/actions/role.ts` (cookie `secure` flag)
- `next.config.ts` (add a global headers block)

**Out of scope**:
- Enforcing a strict Content-Security-Policy that blocks scripts — a wrong CSP
  breaks Next.js hydration / Leaflet / Recharts. Only an OPTIONAL **report-only**
  CSP is allowed here (Step 3), and only if it doesn't break the app.
- Any auth/login changes (ADR 10 — by design).

## Git workflow

- Branch: `advisor/005-cookie-secure-and-security-headers`
- One commit, e.g. `sec: secure role cookie in prod and add baseline headers`.

## Steps

### Step 1: Set `Secure` on the role cookie in production

Add `secure: process.env.NODE_ENV === "production"` to the cookie options (must
be conditional — `secure: true` would stop the cookie being set over plain HTTP
in local dev):

```ts
store.set(ROLE_COOKIE, role, {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30,
});
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Add baseline security headers globally

In `next.config.ts`, add a second entry to the `headers()` array applying to all
routes (keep the existing `/sw.js` entry):

```ts
{
  source: "/:path*",
  headers: [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ],
},
```

(Use `SAMEORIGIN`, not `DENY`, so Vercel's preview toolbar/embedding still works.)

**Verify**: `npm run build` → exit 0.
**Verify after build**: `npm run start` in one shell, then in another
`curl -sI http://localhost:3000/ | grep -i "x-content-type-options"` →
`x-content-type-options: nosniff`. (Stop the server after.) If `curl` is
unavailable in your environment, skip this runtime check and rely on the build
passing plus the config grep in Done criteria.

### Step 3 (OPTIONAL — report-only CSP): only if it does not break the app

If you add a CSP, add it **report-only** (non-enforcing) so nothing breaks:

```ts
{
  key: "Content-Security-Policy-Report-Only",
  value: "default-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
},
```

If after `npm run build && npm run start` the dashboard, map (`/map`), or field
(`/field`) pages show console CSP errors that affect rendering, REMOVE this
header and note it as deferred. Do not ship an enforcing CSP in this plan.

## Test plan

No unit tests (config/headers). Verify via build + the header check in Step 2.
If runtime curl is available, confirm `x-frame-options: SAMEORIGIN` and
`referrer-policy` are present on `/`.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` no new errors
- [ ] `npm run build` exits 0
- [ ] `grep -n "secure:" app/actions/role.ts` → 1 match (the conditional)
- [ ] `grep -n "X-Content-Type-Options" next.config.ts` → 1 match
- [ ] Only `app/actions/role.ts` and `next.config.ts` modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

Stop and report if:

- Adding the global `source: "/:path*"` headers entry breaks the `/sw.js` headers
  (the more specific entry should still apply — verify the SW still loads).
- A report-only CSP cannot be made non-breaking — remove it and mark deferred.

## Maintenance notes

- A real enforcing CSP (with nonces for Next's inline scripts) is the proper
  follow-up; it needs per-request nonce wiring and testing against Leaflet/
  Recharts. Deferred intentionally.
- Reviewer: confirm `secure` is conditional (not hardcoded `true`), or local dev
  login-by-cookie silently breaks.
