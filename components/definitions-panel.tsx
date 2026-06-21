"use client";

import { useState } from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { DEFINITIONS } from "@/lib/definitions";

/**
 * Surfaces the canonical metric definitions in the UI. The point: every number
 * on this dashboard is computed one way, and here is that way — so "meal",
 * "cost", "margin" mean the same thing to the kitchen, finance, and the CEO.
 */
export function DefinitionsPanel() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-surface text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 outline-none rounded-lg"
      >
        <BookOpen className="h-3.5 w-3.5" />
        <span className="font-medium">How these numbers are defined</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 ml-auto transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <dl className="grid gap-3 border-t border-border px-4 py-3 sm:grid-cols-2">
          {DEFINITIONS.map((d) => (
            <div key={d.term}>
              <dt className="font-semibold text-foreground">{d.term}</dt>
              <dd className="mt-0.5 text-muted">{d.short}</dd>
              <dd className="mt-0.5 font-mono text-[11px] text-foreground/70">{d.formula}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
