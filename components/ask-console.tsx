"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Search, CornerDownLeft, FileText, Building2, Landmark, Store } from "lucide-react";
import { cn } from "@/lib/cn";
import { askAction } from "@/app/(app)/ask/actions";
import type { AskResult } from "@/lib/ai/retrieval/ask";
import type { Citation } from "@/lib/ai/retrieval/tools";

/** A logged question + its stored answer, replayable without a new model call. */
export interface AskHistoryEntry {
  id: string;
  question: string;
  answer: string;
  citations: Citation[];
  modelUsed: string;
  createdLabel: string;
}

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

function hrefForCitation(c: Citation): string | undefined {
  if (c.href) return c.href;
  switch (c.type) {
    case "cbo": return `/partners/cbo/${c.id}`;
    case "restaurant": return `/partners/restaurant/${c.id}`;
    case "funder": return `/funders/${c.id}`;
    case "contract": return `/contracts/${c.id}`;
    default: return undefined;
  }
}

// Strip any stray bracketed record ids the model may still emit in prose.
function sanitizeAnswer(answer: string): string {
  return answer.replace(/\s*\[(?:cbo|restaurant|funder|contract|program):[A-Za-z0-9]+\]/g, "");
}

function CitationChip({ c }: { c: Citation }) {
  const Icon = TYPE_ICON[c.type];
  const detail = Object.entries(c.fields ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
  const href = hrefForCitation(c);
  const inner = (
    <div className="flex min-w-0 items-start gap-2 border border-border bg-surface px-3 py-2 transition-colors hover:border-brand-deep/40">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-deep" strokeWidth={2} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{c.type}</span>
          <span className="truncate text-sm font-semibold">{c.label}</span>
        </div>
        {detail && <p className="mt-0.5 break-words text-xs text-muted">{detail}</p>}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-brand-deep">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function Answer({ result, fromLog }: { result: AskResult; fromLog: boolean }) {
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-deep">Answer</span>
        <span className="bg-black/[0.04] px-2 py-0.5 text-[10px] font-medium text-muted">
          AI-assisted · human-reviewable · {result.modelUsed}
          {fromLog && " · from log"}
        </span>
      </div>
      <div className="md mt-2 text-sm leading-relaxed text-foreground">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{sanitizeAnswer(result.answer)}</ReactMarkdown>
      </div>

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
  );
}

export function AskConsole({ history }: { history: AskHistoryEntry[] }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [fromLog, setFromLog] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed || pending) return;
    setQuestion(trimmed);
    setFromLog(false);
    startTransition(async () => {
      setResult(await askAction(trimmed));
    });
  }

  // Replay a logged answer from props — no model call, no spend.
  function replay(h: AskHistoryEntry) {
    setQuestion(h.question);
    setFromLog(true);
    setResult({ answer: h.answer, citations: h.citations, modelUsed: h.modelUsed });
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
        className="flex items-center gap-2 border border-border bg-surface px-3 py-2 focus-within:border-brand-deep"
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
            "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold transition-colors",
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
              className="border border-border bg-surface px-3 py-1 text-xs text-foreground/70 transition-colors hover:border-brand-deep/40 hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {result && <Answer result={result} fromLog={fromLog} />}

      {history.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">Recent questions</div>
          <p className="mt-0.5 text-xs text-muted">Click one to view its saved answer — no new query.</p>
          <ul className="mt-2 divide-y divide-border">
            {history.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => replay(h)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:text-brand-deep"
                >
                  <span className="min-w-0 truncate text-sm">{h.question}</span>
                  <span className="shrink-0 text-[11px] text-muted">{h.createdLabel} · {h.modelUsed}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
