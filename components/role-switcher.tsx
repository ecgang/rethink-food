"use client";

import { useTransition } from "react";
import { ROLES, type RoleKey } from "@/lib/roles";
import { setRole } from "@/app/actions/role";
import { cn } from "@/lib/cn";

/** Switch the active operator role — gates financial views and signs the audit trail. */
export function RoleSwitcher({ current }: { current: RoleKey }) {
  const [pending, start] = useTransition();
  return (
    <div className="hidden lg:block border-t border-border p-3">
      <div className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-muted">Viewing as</div>
      <div className="flex flex-col gap-1">
        {Object.values(ROLES).map((r) => (
          <button
            key={r.key}
            onClick={() => start(() => setRole(r.key))}
            disabled={pending}
            title={r.blurb}
            className={cn(
              "rounded-md px-2 py-1.5 text-left text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-deep disabled:opacity-60",
              current === r.key
                ? "bg-brand text-brand-ink font-semibold"
                : "text-foreground/70 hover:bg-black/[0.04]",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-muted">
        Signed in as <span className="text-foreground">{ROLES[current].person}</span>
      </div>
    </div>
  );
}
