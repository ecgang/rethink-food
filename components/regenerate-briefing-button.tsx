"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import { regenerateBriefingAction } from "@/app/actions/briefing";

/** Busts the 24h briefing cache and re-renders with a freshly generated briefing. */
export function RegenerateBriefingButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => regenerateBriefingAction())}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition-colors",
        pending ? "text-muted" : "text-foreground/70 hover:border-brand-deep/40 hover:text-foreground",
      )}
    >
      <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} strokeWidth={2} />
      {pending ? "Regenerating…" : "Regenerate"}
    </button>
  );
}
