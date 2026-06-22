"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

const DIMS = [
  { key: "program", label: "Program" },
  { key: "kitchen", label: "Kitchen" },
  { key: "restaurant", label: "Restaurant" },
  { key: "contract", label: "Contract" },
  { key: "market", label: "Market" },
] as const;

export function DimensionTabs({ current }: { current: string }) {
  const router = useRouter();
  const params = useSearchParams();

  function select(key: string) {
    const next = new URLSearchParams(params.toString());
    next.set("by", key);
    router.replace(`/?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="flex max-w-full overflow-x-auto rounded-lg border border-border bg-surface p-0.5">
      {DIMS.map((d) => (
        <button
          key={d.key}
          onClick={() => select(d.key)}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-deep focus-visible:ring-offset-1",
            current === d.key
              ? "bg-brand text-brand-ink"
              : "text-foreground/65 hover:text-foreground",
          )}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}
