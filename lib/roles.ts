// Lightweight role-based access model. Demonstrates auth-shaped concepts —
// permissions, role-gated views, and a signed audit identity — WITHOUT a login
// wall that would block click-to-explore. A real build would back this with
// SSO/NextAuth; the capability checks and audit signing stay identical.
//
// Pure module (no next/headers) so it's safe to import from client components.

export type RoleKey = "EXEC" | "FINANCE" | "OPS";

export type Capability = "view:financials" | "approve:intake" | "operate:field";

export interface Role {
  key: RoleKey;
  label: string;
  person: string; // identity recorded in the audit trail
  blurb: string;
  caps: Capability[];
}

export const ROLES: Record<RoleKey, Role> = {
  EXEC: {
    key: "EXEC",
    label: "Executive (COO)",
    person: "Eric Gang",
    blurb: "Full visibility across operations and financials.",
    caps: ["view:financials", "approve:intake", "operate:field"],
  },
  FINANCE: {
    key: "FINANCE",
    label: "Finance",
    person: "Marcus Lee",
    blurb: "Unit economics and contract performance; cannot approve intake.",
    caps: ["view:financials"],
  },
  OPS: {
    key: "OPS",
    label: "Operations",
    person: "Dana Ortiz",
    blurb: "Lifecycle, delivery, and intake; financials are restricted.",
    caps: ["approve:intake", "operate:field"],
  },
};

export const DEFAULT_ROLE: RoleKey = "EXEC";
export const ROLE_COOKIE = "rcc_role";

export function isRoleKey(v: unknown): v is RoleKey {
  return typeof v === "string" && v in ROLES;
}

export function can(role: RoleKey, cap: Capability): boolean {
  return ROLES[role].caps.includes(cap);
}
