// Minimal structured logger. Emits one JSON line per event to stdout, which
// Vercel captures into the runtime logs (queryable, alertable). This is the
// "instrument by default" seam: a real deployment wires `error()` to Sentry via
// instrumentation.ts — the call sites don't change.

type Fields = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", event: string, fields: Fields = {}): void {
  // Stringify defensively — never let logging throw into a request path.
  try {
    const line = JSON.stringify({ level, event, ...fields });
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  } catch {
    console.error(`{"level":"error","event":"log_serialize_failed","for":"${event}"}`);
  }
}

export const log = {
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  /** Log a caught error with its message (never the raw object, to avoid leaking internals to logs). */
  error: (event: string, err: unknown, fields?: Fields) =>
    emit("error", event, { ...fields, error: err instanceof Error ? err.message : String(err) }),
};
