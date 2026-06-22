"use client";

import { usePathname } from "next/navigation";
import type { RoleKey } from "@/lib/roles";

// First path segment → page label, mirroring the sidebar nav. Detail routes
// fall back to their section label (e.g. /partners/cbo/x → "Partners").
const SEGMENT_LABEL: Record<string, string> = {
  meals: "Records",
  deliveries: "Deliveries",
  intake: "AI Intake",
  ask: "Ask the Operating Layer",
  partners: "Partners",
  funders: "Funders",
  contracts: "Contract",
  kitchens: "Kitchen",
  markets: "Market",
  reports: "Reports",
  drafts: "Draft Follow-ups",
  audit: "Audit Trail",
};

const ROLE_LABEL: Record<RoleKey, string> = {
  EXEC: "Executive",
  FINANCE: "Finance",
  OPS: "Operations",
};

/**
 * Slim sticky header for inner content routes — gives the page a sense of chrome
 * and a persistent "you are here / acting as" cue while scrolling. Absent on the
 * home route (the HeroBand owns the top there) and on mobile (MobileTopBar covers
 * that). Identity ("Signed in as …") deliberately stays in the sidebar footer.
 */
export function ContentTopBar({ role }: { role: RoleKey }) {
  const pathname = usePathname();
  if (pathname === "/") return null;

  const segment = pathname.split("/")[1] ?? "";
  const label = SEGMENT_LABEL[segment] ?? "Command Center";

  return (
    <div className="sticky top-0 z-10 hidden h-12 items-center justify-between border-b border-border bg-surface/95 px-5 backdrop-blur-sm lg:flex">
      <span aria-hidden className="text-sm font-semibold tracking-tight">
        {label}
      </span>
      <span
        aria-label={`Viewing as ${ROLE_LABEL[role]}`}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-medium text-brand-deep"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand-deep" />
        {ROLE_LABEL[role]}
      </span>
    </div>
  );
}
