import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_ROLE, ROLE_COOKIE, isRoleKey, ROLES, type RoleKey } from "@/lib/roles";

/** The active role for this request, from the role cookie (defaults to EXEC). */
export async function getCurrentRole(): Promise<RoleKey> {
  const store = await cookies();
  const v = store.get(ROLE_COOKIE)?.value;
  return isRoleKey(v) ? v : DEFAULT_ROLE;
}

/** The identity to record in the audit trail for the active role. */
export async function getOperatorIdentity(): Promise<string> {
  const role = await getCurrentRole();
  return `${ROLES[role].person} · ${ROLES[role].label}`;
}
