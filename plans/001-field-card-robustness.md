# Plan 001: Field-card photo handling leaks no memory and never fails silently

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 20787e3..HEAD -- components/field/field-card.tsx`
> If that file changed since this plan was written, compare the "Current state"
> excerpts against the live code; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `20787e3`, 2026-06-21

## Why this matters

`components/field/field-card.tsx` is the operator's camera screen in the field
PWA. Two defects: (1) every photo pick calls `URL.createObjectURL()` and never
calls `URL.revokeObjectURL()`, so each retake leaks a blob URL — over a shift of
many deliveries on a phone, memory grows unbounded. (2) `onPick` `await`s
`downscale()` with no try/catch; if `createImageBitmap`/canvas throws (large
image, low memory), the rejection is swallowed and the operator sees nothing
happen. Both are cheap to fix and directly affect the reliability of the
shipped field workflow.

## Current state

- `components/field/field-card.tsx` — client component; `downscale()` (image
  resize) at lines ~22–40, `onPick` handler at ~49–57, `preview` state at ~46.

Excerpt (the two relevant spots, as they exist today):

```tsx
const [preview, setPreview] = useState<string | null>(null);
const [photo, setPhoto] = useState<Blob | null>(null);
const [error, setError] = useState<string | null>(null);

async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  setError(null);
  const small = await downscale(file);
  setPhoto(small);
  setPreview(URL.createObjectURL(small));
}
```

`downscale()` already degrades gracefully on a null `toBlob` result (returns the
original `file`), but it can still *throw* before that point.

Repo conventions: this file already uses a `useState` error string rendered as
`{error && <p className="...text-[var(--sev-critical)]">{error}</p>}`. Reuse
that same error channel — do not add a new UI pattern. `React`/`useEffect` are
imported from `"react"`.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npm run typecheck`| exit 0, no errors   |
| Lint      | `npm run lint`     | no NEW errors (see note in STOP) |
| Build     | `npm run build`    | exit 0 (`DATABASE_URL` must be set in env) |

## Scope

**In scope** (only file to modify):
- `components/field/field-card.tsx`

**Out of scope** (do NOT touch):
- `app/actions/field.ts` — the server action is a separate concern (Plan 002).
- The upload/submit flow and button markup — only the photo-pick + preview
  lifecycle changes here.

## Git workflow

- Branch: `advisor/001-field-card-robustness`
- One commit; conventional-commit style (match `git log`), e.g.
  `fix(field): revoke object URLs and handle photo-downscale errors`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Revoke the previous object URL and clean up on unmount

Track and revoke blob URLs so they don't leak. In `onPick`, revoke any existing
`preview` before creating a new one. Add a `useEffect` cleanup that revokes the
current `preview` on unmount. Target shape:

```tsx
// revoke the prior preview before replacing it
setPreview((prev) => {
  if (prev) URL.revokeObjectURL(prev);
  return URL.createObjectURL(small);
});
```

```tsx
// revoke on unmount
useEffect(() => {
  return () => {
    if (preview) URL.revokeObjectURL(preview);
  };
}, [preview]);
```

(Add `useEffect` to the existing `import { ... } from "react"` line.)

### Step 2: Catch downscale failures and surface them

Wrap the `downscale(file)` call in `onPick` in try/catch; on failure set the
existing `error` state with a clear message and do not set photo/preview:

```tsx
async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  setError(null);
  try {
    const small = await downscale(file);
    setPhoto(small);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(small);
    });
  } catch {
    setError("Couldn't process that photo — try again.");
  }
}
```

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Confirm lint and build

**Verify**: `npm run lint` → no new errors for `field-card.tsx`.
**Verify**: `npm run build` → exit 0.

## Test plan

This is a browser-only client component (DOM `URL`, `createImageBitmap`,
`canvas`); the repo's Vitest setup is `environment: "node"` (`vitest.config.ts`)
with no jsdom, so a unit test would require new infrastructure — out of scope.
Verification is by typecheck + lint + build (above) plus a manual check:

- Manual: run `npm run dev`, open `/field`, on a meal under "Deliver" tap
  "Add photo" twice; confirm a preview shows and replacing it doesn't error.
  (No automated test is added; note this gap in `plans/README.md`.)

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` reports no new errors in `components/field/field-card.tsx`
- [ ] `npm run build` exits 0
- [ ] `grep -n "revokeObjectURL" components/field/field-card.tsx` returns ≥1 match
- [ ] `onPick` body is wrapped in try/catch that sets `error` on failure
- [ ] No files outside `components/field/field-card.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- The "Current state" excerpt doesn't match the live file (drift).
- `npm run lint` reveals a PRE-EXISTING error unrelated to this file
  (`components/use-count-up.ts` has a known `set-state-in-effect` error — that
  is Plan 003's job, NOT this plan's; do not fix it here).
- Adding the `useEffect` cleanup introduces an exhaustive-deps lint error you
  can't resolve without changing behavior.

## Maintenance notes

- If photo capture later supports multiple images per delivery, the
  revoke-on-replace logic must track a list of URLs, not a single `preview`.
- Reviewer: confirm the unmount cleanup uses the latest `preview` value (the
  effect dependency array includes `preview`).
