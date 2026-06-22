import "server-only";
import { cookies } from "next/headers";
import { ROLE_COOKIE, ROLES, type RoleKey } from "@/lib/roles";
import { readRoleCookie } from "@/lib/role-cookie";

/**
 * The active role for this request, verified from the HMAC-signed role cookie
 * (a tampered or legacy-plaintext cookie falls back to the default role).
 */
export async function getCurrentRole(): Promise<RoleKey> {
  const store = await cookies();
  return readRoleCookie(store.get(ROLE_COOKIE)?.value);
}

/** The identity to record in the audit trail for the active role. */
export async function getOperatorIdentity(): Promise<string> {
  const role = await getCurrentRole();
  return `${ROLES[role].person} · ${ROLES[role].label}`;
}
