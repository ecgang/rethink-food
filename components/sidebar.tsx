"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Inbox, Map, Smartphone, Table2, PackageCheck } from "lucide-react";
import { cn } from "@/lib/cn";
import { RoleSwitcher } from "@/components/role-switcher";
import type { RoleKey } from "@/lib/roles";

const NAV = [
  { href: "/", label: "Command Center", short: "Home", icon: LayoutDashboard },
  { href: "/meals", label: "Records", short: "Records", icon: Table2 },
  { href: "/deliveries", label: "Deliveries", short: "Proof", icon: PackageCheck },
  { href: "/intake", label: "AI Intake", short: "Intake", icon: Inbox },
  { href: "/map", label: "Demand Map", short: "Map", icon: Map },
  { href: "/field", label: "Field App", short: "Field", icon: Smartphone },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar({ role }: { role: RoleKey }) {
  const pathname = usePathname();
  return (
    <>
      {/* Desktop: persistent left rail */}
      <aside className="hidden lg:flex w-60 shrink-0 border-r border-border bg-surface flex-col">
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-brand-ink font-display font-extrabold text-sm shrink-0">
              R
            </span>
            <div className="leading-tight">
              <div className="font-display font-extrabold text-base tracking-tight">Rethink</div>
              <div className="text-[11px] text-muted">Command Center</div>
            </div>
          </div>
        </div>
        <nav className="p-3 flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                title={label}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-deep",
                  active
                    ? "bg-brand text-brand-ink font-semibold"
                    : "text-foreground/70 hover:bg-black/[0.04]",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto">
          <RoleSwitcher current={role} />
          <div className="p-4 text-[11px] text-muted leading-relaxed">
            Demo build · real NYC data
            <br />
            Lead Full-Stack Engineer application
          </div>
        </div>
      </aside>

      {/* Mobile: fixed bottom tab bar */}
      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-border bg-surface/95 backdrop-blur-sm"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        {NAV.map(({ href, short, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                active ? "text-brand-deep" : "text-muted",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
              <span className="leading-none">{short}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
