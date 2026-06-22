"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Search, CornerDownLeft, FileText, Building2, Landmark, Store } from "lucide-react";
import { cn } from "@/lib/cn";
import { askAction } from "@/app/(app)/ask/actions";
import type { AskResult } from "@/lib/ai/retrieval/ask";
import type { Citation } from "@/lib/ai/retrieval/tools";

const EXAMPLES = [
  "Which funders have the largest committed budgets?",
  "Show me the contracts with PHS",
  "What partners do we work with in the Bronx?",
  "How many meals has the largest CBO received?",
];

const TYPE_ICON: Record<Citation["type"], typeof FileText> = {
  cbo: Building2,
  restaurant: Store,
  funder: Landmark,
  contract: FileText,
  program: FileText,
};

function CitationChip({ c }: { c: Citation }) {
  const Icon = TYPE_ICON[c.type];
  const detail = Object.entries(c.fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
  const inner = (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2 transition-colors hover:border-brand-deep/40">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-deep" strokeWidth={2} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{c.type}</span>
          <span className="truncate text-sm font-semibold">{c.label}</span>
        </div>
        {detail && <p className="mt-0.5 truncate text-xs text-muted">{detail}</p>}
      </div>
    </div>
  );
  return c.href ? (
    <Link href={c.href} className="block outline-none focus-visible:ring-2 focus-visible:ring-brand-deep rounded-lg">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function AskConsole() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed || pending) return;
    setQuestion(trimmed);
    startTransition(async () => {
      setResult(await askAction(trimmed));
    });
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
        className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 focus-within:border-brand-deep"
      >
        <Search className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} />
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about partners, funders, contracts, program activity…"
          aria-label="Ask the operating layer"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={pending || !question.trim()}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
            pending || !question.trim()
              ? "bg-black/[0.04] text-muted"
              : "bg-brand text-brand-ink hover:bg-brand-deep hover:text-white",
          )}
        >
          {pending ? "Searching…" : "Ask"}
          {!pending && <CornerDownLeft className="h-3.5 w-3.5" strokeWidth={2.5} />}
        </button>
      </form>

      {!result && !pending && (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => submit(ex)}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground/70 transition-colors hover:border-brand-deep/40 hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {result && (
        <div className="mt-5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-deep">Answer</span>
            <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[10px] font-medium text-muted">
              AI-assisted · human-reviewable · {result.modelUsed}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{result.answer}</p>

          {result.citations.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
                Sources ({result.citations.length})
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {result.citations.map((c) => (
                  <CitationChip key={`${c.type}:${c.id}`} c={c} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
