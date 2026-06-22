# Plan 002: Field delivery-photo upload validates type and size before storing

> **Executor instructions**: Follow step by step. Run every verification command
> and confirm the expected result before moving on. On any "STOP condition",
> stop and report. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 20787e3..HEAD -- app/actions/field.ts`
> If that file changed, compare the "Current state" excerpt to the live code; on
> mismatch, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `20787e3`, 2026-06-21

## Why this matters

`markDelivered` in `app/actions/field.ts` uploads the operator's photo to Vercel
Blob with `access: "public"` and a hardcoded `contentType: "image/jpeg"`, but it
never validates that the uploaded `File` is actually an image or bounds its
size. Any file (any MIME) can be stored at a public CDN URL as `*.jpg`, and a
client bypassing the in-app downscaling can push up to the global 4 MB server-
action limit per call. Validating type and size at the server boundary is a
small, standard hardening of a public upload path.

## Current state

- `app/actions/field.ts` — server action file (`"use server"`). The photo
  handling lives inside `markDelivered`, roughly lines 46–60.

Excerpt as it exists today:

```ts
let deliveryPhotoUrl: string | null = null;
const photo = formData.get("photo");
if (photo instanceof File && photo.size > 0) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await put(`deliveries/${mealId}.jpg`, photo, {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: true,
      });
      deliveryPhotoUrl = blob.url;
    } catch {
      return { ok: false, error: "Photo upload failed. Try again." };
    }
  }
  // else: no Blob store configured — proceed without the photo.
}
```

Conventions: this file returns a discriminated `FieldResult`
(`{ ok: true, ... } | { ok: false, error }`) — never throw to the client. Errors
are short, operator-readable strings. `put` is imported from `@vercel/blob`.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npm run typecheck`| exit 0              |
| Lint      | `npm run lint`     | no new errors       |
| Build     | `npm run build`    | exit 0 (`DATABASE_URL` set) |

## Scope

**In scope** (only file to modify):
- `app/actions/field.ts`

**Out of scope** (do NOT touch):
- `components/field/field-card.tsx` — client-side capture (Plan 001).
- `next.config.ts` `bodySizeLimit` — the global 4 MB cap stays; this plan adds a
  tighter per-action check, it does not change global config.

## Git workflow

- Branch: `advisor/002-harden-field-upload`
- One commit, e.g. `fix(field): validate photo type and size before Blob upload`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add type + size constants and validate before upload

Near the top of the file (after imports), add:

```ts
const MAX_PHOTO_BYTES = 2_000_000; // 2 MB — downscaled photos are ~150–300KB
```

Then in `markDelivered`, before the `put()` call, reject non-images and oversize
files via the existing `FieldResult` error channel. Target shape:

```ts
if (photo instanceof File && photo.size > 0) {
  if (!photo.type.startsWith("image/")) {
    return { ok: false, error: "Attach an image file." };
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return { ok: false, error: "Photo must be under 2 MB." };
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    // ...existing put() block unchanged...
  }
}
```

Keep `contentType: "image/jpeg"` as-is only if you also keep the downscale step
(client always sends JPEG); otherwise set `contentType: photo.type`. Prefer
`contentType: photo.type` so the stored object's type matches the validated
file.

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Confirm lint and build

**Verify**: `npm run lint` → no new errors in `app/actions/field.ts`.
**Verify**: `npm run build` → exit 0.

## Test plan

These server actions have no automated coverage yet, and the validation is pure
input-checking that Plan 007 will cover when it adds mocked-Prisma action tests.
For THIS plan, verify by:

- Typecheck + lint + build (above).
- Optional manual: with `BLOB_READ_WRITE_TOKEN` unset locally, the delivery
  still records without a photo (unchanged behavior); with a non-image or >2 MB
  file the action returns `{ ok: false }` and the meal is NOT advanced.

If you implement Plan 007 in the same session, add a `markDelivered` case
asserting a non-image `File` returns `{ ok: false }` and no `meal.updateMany`
runs.

## Done criteria

ALL must hold:

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` reports no new errors
- [ ] `npm run build` exits 0
- [ ] `grep -n "MAX_PHOTO_BYTES" app/actions/field.ts` returns ≥2 matches (decl + use)
- [ ] `grep -n "startsWith(\"image/\")" app/actions/field.ts` returns ≥1 match
- [ ] Only `app/actions/field.ts` modified (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

Stop and report if:

- The "Current state" excerpt doesn't match the live file (drift).
- `markVerified` (the other action) appears to also do uploads — it should not;
  if it does, the file has drifted and this plan's assumptions are stale.

## Maintenance notes

- If the field app later supports non-JPEG capture, keep `contentType: photo.type`.
- Magic-byte sniffing (verifying the JPEG SOI marker) is a deliberate follow-up,
  not included here — MIME + size is the right cost/benefit for this app.
- Reviewer: confirm the validation runs even when `BLOB_READ_WRITE_TOKEN` is
  set, and that a rejected file never reaches `meal.updateMany`.
