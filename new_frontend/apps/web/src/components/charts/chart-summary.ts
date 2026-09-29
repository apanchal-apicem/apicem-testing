import type { QueryColumn } from "@apicem/api-contract";
import { formatByType, formatCompact } from "@/lib/format";
import { valueColumns } from "./chart-types";

/**
 * Recharts renders an SVG with no accessible content of its own — a screen
 * reader reaching one gets an unlabeled pile of internal nodes, nothing
 * describing what the chart actually shows. Every chart component wraps its
 * `ResponsiveContainer` in a `role="img"` element with one of these as its
 * `aria-label`, so a screen reader announces the trend and range instead of
 * silence (or Recharts' own internal DOM structure read node by node).
 */
function describeOneSeries(rows: Array<Record<string, string | number>>, col: QueryColumn): string {
  const values = rows.map((r) => r[col.key]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return `${col.label}: no data`;

  const format = (v: number) => formatByType(v, col.type === "currency" ? "currency" : "number");
  const first = values[0];
  const last = values[values.length - 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const trend = last > first ? "trending up" : last < first ? "trending down" : "flat";

  return `${col.label} over ${values.length} points, from ${format(first)} to ${format(last)} (${trend}), ranging ${format(min)} to ${format(max)}`;
}

/**
 * A multi-metric or cross-tab result has more than one value column (see
 * resolveQuery's doc comment in mock/fixtures.ts) — describes every one of
 * them, not just the first, joined into one sentence. For the ordinary
 * single-value-column case this produces exactly the same string as
 * before, since joining a one-element array has no separator to add.
 */
export function describeQuerySeries(rows: Array<Record<string, string | number>>, columns: QueryColumn[]): string {
  const valueCols = valueColumns(columns);
  if (valueCols.length === 0) return "Chart with no data";
  return valueCols.map((col) => describeOneSeries(rows, col)).join("; ");
}

export function describeLiftSeries(
  treatmentSeries: Array<{ date: string; value: number }>,
  holdoutSeries: Array<{ date: string; value: number }>,
): string {
  if (treatmentSeries.length === 0) return "Treatment vs. holdout chart with no data";
  const tFirst = treatmentSeries[0].value;
  const tLast = treatmentSeries[treatmentSeries.length - 1].value;
  const hFirst = holdoutSeries[0]?.value;
  const hLast = holdoutSeries[holdoutSeries.length - 1]?.value;
  return (
    `Line chart comparing treatment and holdout over ${treatmentSeries.length} weeks. ` +
    `Treatment goes from ${formatCompact(tFirst)} to ${formatCompact(tLast)}; ` +
    `holdout goes from ${formatCompact(hFirst ?? 0)} to ${formatCompact(hLast ?? 0)}.`
  );
}
