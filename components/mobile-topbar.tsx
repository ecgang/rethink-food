"use client";

import { useTransition } from "react";
import { ROLES, type RoleKey } from "@/lib/roles";
import { setRole } from "@/app/actions/role";
import { cn } from "@/lib/cn";

const SHORT: Record<RoleKey, string> = { EXEC: "Exec", FINANCE: "Finance", OPS: "Ops" };

/**
 * Mobile-only top bar: brand + compact role switcher. On desktop the left rail
 * carries these, but on a phone the rail is replaced by a bottom tab bar, so
 * role switching lives here.
 */
export function MobileTopBar({ role }: { role: RoleKey }) {
  const [pending, start] = useTransition();
  return (
    <div className="lg:hidden sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-brand text-brand-ink font-display font-extrabold text-xs shrink-0">
          R
        </span>
        <span className="truncate font-display text-sm font-extrabold tracking-tight">Rethink</span>
      </div>
      <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Viewing as">
        {(Object.keys(ROLES) as RoleKey[]).map((k) => (
          <button
            key={k}
            onClick={() => start(() => setRole(k))}
            disabled={pending}
            title={ROLES[k].blurb}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-60",
              role === k ? "bg-brand text-brand-ink" : "bg-black/[0.05] text-foreground/70",
            )}
          >
            {SHORT[k]}
          </button>
        ))}
      </div>
    </div>
  );
}
