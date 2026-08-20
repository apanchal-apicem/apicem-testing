export function formatCurrency(value: number | null | undefined, maximumFractionDigits = 0): string {
  if (value === null || value === undefined) return "—";
  // minimumFractionDigits must match, or toLocaleString drops trailing zeros inconsistently
  // (e.g. $9,270.6 next to $9,581.62 in the same column).
  return `$${value.toLocaleString(undefined, { maximumFractionDigits, minimumFractionDigits: maximumFractionDigits })}`;
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString();
}

export function formatPercent(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

export function formatRatio(value: number | null | undefined, fractionDigits = 2): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(fractionDigits)}x`;
}

/** Best-effort formatting for a table cell where the column's semantics are only known by
 * its key name (metric tables have different shapes per dashboard, doc Sec 8.1) -- covers
 * the column names this app's TABLE_METRICS actually produce, not a general-purpose guesser. */
export function formatTableCell(key: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return String(value);

  if (["revenue", "spend", "value", "inventory_value", "cpa"].some((k) => key.includes(k))) {
    return formatCurrency(numeric, 2);
  }
  if (key === "roas") return formatRatio(numeric);
  if (key.includes("ctr") || key.includes("rate")) return formatPercent(numeric);
  return formatCount(numeric);
}
