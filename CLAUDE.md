# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |

---

# Rethink Command Center — project guide

Next.js 16 portfolio app: a food-ops "Command Center" dashboard, AI intake, and demand map. Real NYC data, Prisma/Postgres, live Anthropic intake.

## ⚠️ Next.js 16 — read the docs before writing code
This is **Next.js 16.2.9** (App Router / RSC / Server Actions) + **React 19**. APIs and conventions differ from older Next.js. Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/`. Heed deprecation notices. (Mirrors AGENTS.md.)

## Commands Claude can't guess
- `npm test` → `vitest run` (single test: `npx vitest run -t "name"`). `npm run test:watch` for watch.
- `npm run typecheck` → `tsc --noEmit`. `npm run lint` → eslint.
- `npm run build` → `prisma generate && next build` (needs `DATABASE_URL` set, even though no DB connection is made at build).
- `npm run db:seed` → `tsx prisma/seed.ts` (reads committed `data/*.json`, plants anomalies for the "act on today" engine).
- `npm run ingest` → regenerates `data/*.json` from NYC Open Data + rethinkfood.org (deterministic, offline-safe snapshots — commit the output).
- **CI** (`.github/workflows/ci.yml`, Node 20) runs: `npm ci` → `prisma generate` → typecheck → test → build. Keep all four green.

## Database / Prisma
- **Prisma is pinned to v6 (6.19.3) — do not upgrade to v7.**
- Local dev = Docker Postgres on **port 5433** (not 5432). `DATABASE_URL` in `.env`.
- `prisma migrate dev` / `migrate reset` are interactive and **gated in this env** — for schema changes use `prisma migrate diff` → `prisma migrate deploy`. Reseed Neon with `DATABASE_URL=$DATABASE_URL_UNPOOLED npx prisma db seed`.

## Conventions / gotchas
- **Tailwind v4** — no `tailwind.config.ts`; config is the PostCSS plugin. TS path alias `@/*` → `./`; `strict: true`.
- **AI intake**: `/intake` uses the live Anthropic model (`claude-haiku-4-5`) when `ANTHROPIC_API_KEY` is set; otherwise falls back to a deterministic parser. Don't assume the key exists.
- Core tested logic lives in `lib/` — `margin.ts` (unit economics), `exceptions.ts` (act-on-today engine), `definitions.ts` (canonical metrics). Add tests when touching these.
- `data/*.json` are committed real-data snapshots (NYC NTA 2020, Rethink's real partner roster, food-insecurity) — the source of truth for the seed; regenerate via `npm run ingest`, don't hand-edit.
- Docs: `docs/ARCHITECTURE.md` (data dictionary), `docs/DECISIONS.md` (ADR log), `docs/DEMO_SCRIPT.md`.
