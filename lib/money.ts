// All monetary values are stored as integer cents to avoid floating-point drift.
// These helpers are the single place where cents become human-readable dollars.

/** Format integer cents as USD, e.g. 1234 -> "$12.34". */
export function formatUsd(
  cents: number,
  opts: { maximumFractionDigits?: number } = {},
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: opts.maximumFractionDigits ?? 2,
  }).format(cents / 100);
}

/** Compact USD for large totals, e.g. 123456789 -> "$1.2M". */
export function formatUsdCompact(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

/** Format a ratio (0.1234) as a percentage string ("12.3%"). */
export function formatPct(ratio: number, fractionDigits = 1): string {
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

/** Thousands-separated integer, e.g. 12345 -> "12,345". */
export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}
