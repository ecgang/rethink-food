"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Inbox, Map } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "Command Center", icon: LayoutDashboard },
  { href: "/intake", label: "AI Intake", icon: Inbox },
  { href: "/map", label: "Demand Map", icon: Map },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-surface flex flex-col">
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-white font-semibold text-sm">
            R
          </span>
          <div className="leading-tight">
            <div className="font-semibold text-sm">Rethink</div>
            <div className="text-[11px] text-muted">Command Center</div>
          </div>
        </div>
      </div>
      <nav className="p-3 flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-brand-soft text-brand font-medium"
                  : "text-foreground/70 hover:bg-black/[0.04]",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto p-4 text-[11px] text-muted leading-relaxed">
        Demo build · seeded data
        <br />
        Lead Full-Stack Engineer application
      </div>
    </aside>
  );
}
