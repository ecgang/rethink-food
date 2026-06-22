"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Inbox, Landmark, Map, Smartphone, Table2, PackageCheck, Users, FileBarChart2, ScrollText, Search, Mail, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { RoleSwitcher } from "@/components/role-switcher";
import type { RoleKey } from "@/lib/roles";

const NAV = [
  { href: "/", label: "Command Center", short: "Home", icon: LayoutDashboard },
  { href: "/meals", label: "Records", short: "Records", icon: Table2 },
  { href: "/deliveries", label: "Deliveries", short: "Proof", icon: PackageCheck },
  { href: "/intake", label: "AI Intake", short: "Intake", icon: Inbox },
  { href: "/ask", label: "Ask AI", short: "Ask", icon: Search },
  { href: "/partners", label: "Partners", short: "Partners", icon: Users },
  { href: "/funders", label: "Funders", short: "Funders", icon: Landmark },
  { href: "/reports", label: "Reports", short: "Reports", icon: FileBarChart2 },
  { href: "/drafts", label: "Draft Follow-ups", short: "Drafts", icon: Mail },
  { href: "/map", label: "Demand Map", short: "Map", icon: Map },
  { href: "/field", label: "Field App", short: "Field", icon: Smartphone },
  { href: "/audit", label: "Audit Trail", short: "Audit", icon: ScrollText },
] as const;

// The mobile bottom bar shows only these primary destinations; everything else
// lives in a "More" sheet so the bar never crowds. Desktop shows the full rail.
const MOBILE_PRIMARY_HREFS: string[] = ["/", "/meals", "/ask", "/map"];
const MOBILE_PRIMARY = NAV.filter((n) => MOBILE_PRIMARY_HREFS.includes(n.href));
const MOBILE_MORE = NAV.filter((n) => !MOBILE_PRIMARY_HREFS.includes(n.href));

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar({ role }: { role: RoleKey }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const onMorePage = MOBILE_MORE.some((n) => isActive(pathname, n.href));
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
              <div className="font-display font-extrabold text-base tracking-tight">Rethink Food</div>
              <div className="text-[11px] text-muted">Command Center</div>
            </div>
          </div>
        </div>
        <nav className="p-3 flex flex-1 min-h-0 flex-col gap-1 overflow-y-auto">
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
        <div className="shrink-0 border-t border-border">
          <RoleSwitcher current={role} />
          <div className="p-4 text-[11px] text-muted leading-relaxed">
            Demo build · real NYC data
            <br />
            Lead Full-Stack Engineer application
          </div>
        </div>
      </aside>

      {/* Mobile: backdrop + "More" sheet for the secondary destinations */}
      {moreOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMoreOpen(false)}
          className="lg:hidden fixed inset-0 z-30 bg-black/30"
        />
      )}
      {moreOpen && (
        <div
          className="lg:hidden fixed inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-border bg-surface pt-3 shadow-[0_-4px_24px_rgba(0,0,0,0.12)]"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 4.25rem)" }}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
          <div className="grid grid-cols-4 gap-1 px-3">
            {MOBILE_MORE.map(({ href, short, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl px-1 py-3 text-[11px] font-medium transition-colors",
                    active ? "bg-brand text-brand-ink" : "text-foreground/70 hover:bg-black/[0.04]",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                  <span className="leading-none">{short}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile: fixed bottom tab bar — 4 primary tabs + More */}
      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t border-border bg-surface/95 backdrop-blur-sm"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        {MOBILE_PRIMARY.map(({ href, short, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              onClick={() => setMoreOpen(false)}
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
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-label="More"
          aria-expanded={moreOpen}
          className={cn(
            "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
            moreOpen || onMorePage ? "text-brand-deep" : "text-muted",
          )}
        >
          <MoreHorizontal className="h-5 w-5" strokeWidth={2} />
          <span className="leading-none">More</span>
        </button>
      </nav>
    </>
  );
}
