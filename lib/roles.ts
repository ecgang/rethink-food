// Lightweight role-based access model. Demonstrates auth-shaped concepts —
// capability-gated permissions, role-gated views, and a tamper-evident audit
// identity (the role cookie is HMAC-signed; see lib/role-cookie.ts) — WITHOUT a
// login wall that would block click-to-explore. Role *selection* is open by demo
// choice; production swaps the signer for an SSO session lookup, leaving these
// capability checks unchanged.
//
// Pure module (no next/headers, no node:crypto) so it's safe to import from
// client components.

export type RoleKey = "EXEC" | "FINANCE" | "OPS";

export type Capability =
  | "view:financials"
  | "approve:intake"
  | "operate:field"
  | "invoice:contract"
  | "match:supply";

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
    caps: [
      "view:financials",
      "approve:intake",
      "operate:field",
      "invoice:contract",
      "match:supply",
    ],
  },
  FINANCE: {
    key: "FINANCE",
    label: "Finance",
    person: "Marcus Lee",
    blurb: "Unit economics and contract performance; cannot approve intake.",
    caps: ["view:financials", "invoice:contract"],
  },
  OPS: {
    key: "OPS",
    label: "Operations",
    person: "Dana Ortiz",
    blurb: "Lifecycle, delivery, and intake; financials are restricted.",
    caps: ["approve:intake", "operate:field", "match:supply"],
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
