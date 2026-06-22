// RFC 4180 CSV serializer. Pure functions, no I/O, no Prisma.
//
// Trailing-newline contract: NO trailing \r\n after the last line.
// The returned string ends with the last field of the last row (or the header
// when rows is empty). Splitting on "\r\n" always yields exactly 1 + rows.length
// non-empty elements.

export interface CsvColumn<T> {
  key: keyof T;
  label: string;
}

/**
 * Serialize `rows` to an RFC 4180 CSV string.
 *
 * - Line terminator: \r\n (RFC 4180 §2.4).
 * - Fields are quoted iff they contain a comma, double-quote, CR, or LF.
 * - Embedded double-quotes are escaped as "".
 * - null / undefined  →  empty string.
 * - Date             →  value.toISOString().
 * - number / boolean →  String(value).
 * - No trailing \r\n after the last line.
 * - Formula injection guard: string fields whose first character is one of
 *   = + - @ \t \r are prefixed with a single quote so spreadsheets (Excel,
 *   Sheets) treat the value as text rather than executing a formula.
 *   Numbers and booleans are not formula vectors and are left unchanged.
 *   The prefix is applied BEFORE RFC-4180 quoting so the quote wrapping
 *   still fires correctly when the (now-prefixed) value contains commas etc.
 */
export function toCsv<T extends Record<string, unknown>>(
  columns: CsvColumn<T>[],
  rows: T[],
): string {
  const CRLF = "\r\n";

  /** Prefix string values that start with a spreadsheet formula trigger. */
  function neutralizeFormula(raw: string): string {
    if (raw.length > 0 && /^[=+\-@\t\r]/.test(raw)) {
      return `'${raw}`;
    }
    return raw;
  }

  function serializeField(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return quoteIfNeeded(value.toISOString());
    if (typeof value === "number" || typeof value === "boolean")
      return String(value);
    return quoteIfNeeded(neutralizeFormula(String(value)));
  }

  function quoteIfNeeded(raw: string): string {
    if (/[,"\r\n]/.test(raw)) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  }

  const header = columns.map((c) => quoteIfNeeded(c.label)).join(",");

  if (rows.length === 0) return header;

  const body = rows
    .map((row) => columns.map((c) => serializeField(row[c.key])).join(","))
    .join(CRLF);

  return header + CRLF + body;
}
