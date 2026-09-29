import type { QueryColumn, QueryResult } from "@apicem/api-contract";

export type ChartHeight = number | `${number}%`;

/**
 * A result's plottable series columns — every column after the first
 * (the x-axis/first grouping column) whose type is actually numeric.
 * A two-dimension cross-tab's columns look like [dimA, dimB, metric...] —
 * `columns.slice(1)` alone would treat dimB's string labels as a second
 * series to plot, producing a broken/invisible line or bar and a tooltip
 * row showing a category name where a number was expected. Filtering to
 * number/currency columns is what a chart can actually draw a mark for.
 */
export function valueColumns(columns: QueryColumn[]): QueryColumn[] {
  return columns.slice(1).filter((c) => c.type === "number" || c.type === "currency");
}

/**
 * Rebases every value column to its own first row = 100, so two or more
 * metrics on wildly different scales (revenue in the tens of thousands next
 * to a cost in the tens) can share one honestly-labeled axis. Without this,
 * a chart with several metrics either has to flatten every metric but one
 * against a shared raw-value axis, or give each metric its own hidden scale
 * and print only one of their number ranges — a viewer has no way to tell
 * that a line drawn near the top of the chart doesn't mean the same thing
 * for every series. Indexing gives every series a comparable, printable
 * unit ("% of its own starting point") without inventing a fake shared
 * scale for values that were never on the same scale to begin with. The
 * original value survives alongside it under `${key}__raw` so the tooltip
 * can still show the real number instead of the percentage.
 */
export function indexToFirstPeriod(
  rows: Array<Record<string, string | number>>,
  valueCols: QueryColumn[],
): Array<Record<string, string | number>> {
  const bases = new Map(
    valueCols.map((col) => [col.key, typeof rows[0]?.[col.key] === "number" ? (rows[0][col.key] as number) : 0]),
  );
  return rows.map((row) => {
    const next = { ...row };
    for (const col of valueCols) {
      const base = bases.get(col.key) ?? 0;
      const raw = row[col.key];
      next[`${col.key}__raw`] = raw;
      next[col.key] = typeof raw === "number" && base !== 0 ? (raw / base) * 100 : 0;
    }
    return next;
  });
}

/**
 * Narrows a multi-metric result down to just the value columns in
 * `metricIds`, keeping the first (x-axis/dimension) column untouched —
 * lets a chart isolate one selected metric out of several, or restore all
 * of them, without a second query round-trip for a filter the client
 * already has every column for.
 */
export function filterResultToMetrics(result: QueryResult, metricIds: string[]): QueryResult {
  const keepKeys = new Set([result.columns[0]?.key, ...metricIds]);
  const columns = result.columns.filter((c) => keepKeys.has(c.key));
  const rows = result.rows.map((row) => {
    const next: Record<string, string | number> = {};
    for (const c of columns) next[c.key] = row[c.key];
    return next;
  });
  return { ...result, columns, rows };
}
