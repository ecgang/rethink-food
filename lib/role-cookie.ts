// HMAC-signs the role cookie so it is tamper-evident: a client cannot hand-edit
// `rcc_role` to a role they did not select through the app. Role *selection* is
// still open by demo choice (no login wall); production swaps signRoleCookie for
// an SSO session lookup, leaving the capability checks (lib/roles.ts) unchanged.
//
// Server-only by nature (node:crypto). Kept Prisma/next-free so it unit-tests in
// the vitest node environment.

import { createHmac, timingSafeEqual } from "node:crypto";
import { DEFAULT_ROLE, isRoleKey, type RoleKey } from "@/lib/roles";

/** Fail-closed: a real secret is REQUIRED in production; dev gets a fixed fallback. */
function secret(): string {
  const s = process.env.ROLE_COOKIE_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("ROLE_COOKIE_SECRET must be set in production");
  }
  return "rcc-dev-secret-not-for-production";
}

function mac(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Tamper-evident cookie value: `role.timestamp.hmac`. */
export function signRoleCookie(role: RoleKey, now: number = Date.now()): string {
  const payload = `${role}.${now}`;
  return `${payload}.${mac(payload)}`;
}

/**
 * Verify + parse a role cookie. Returns the embedded role only if the HMAC checks
 * out (constant-time); any tampering, missing, or legacy plaintext value falls
 * back to DEFAULT_ROLE.
 */
export function readRoleCookie(value: string | undefined): RoleKey {
  if (!value) return DEFAULT_ROLE;
  const lastDot = value.lastIndexOf(".");
  if (lastDot <= 0) return DEFAULT_ROLE;

  const payload = value.slice(0, lastDot);
  const provided = Buffer.from(value.slice(lastDot + 1));
  const expected = Buffer.from(mac(payload));

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return DEFAULT_ROLE;
  }

  const role = payload.split(".")[0];
  return isRoleKey(role) ? role : DEFAULT_ROLE;
}
