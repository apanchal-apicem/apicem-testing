import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { QueryColumn } from "@apicem/api-contract";
import { ChartTooltip } from "./chart-tooltip";
import { indexToFirstPeriod, valueColumns, type ChartHeight } from "./chart-types";
import { describeQuerySeries } from "./chart-summary";

// One color per value column, cycling through the 6 chart tokens theme.css
// defines (see theme.css's --chart-1..6) — matches the 6-metric cap the
// engine and the report builder's multi-select both enforce.
const CHART_COLORS = ["var(--chart-2)", "var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

export function QueryBarChart({
  rows,
  columns,
  height = 260,
}: {
  rows: Array<Record<string, string | number>>;
  columns: QueryColumn[];
  height?: ChartHeight;
}) {
  const xKey = columns[0]?.key ?? "x";
  const valueCols = valueColumns(columns);
  const indexed = valueCols.length > 1;
  const plotRows = indexed ? indexToFirstPeriod(rows, valueCols) : rows;

  return (
    // Recharts' SVG carries no accessible content of its own; role="img"
    // with a computed summary gives a screen reader the trend and range
    // instead of an unlabeled pile of internal chart nodes. A real <img>
    // isn't an option: it can't have children, and the chart it would need
    // to replace is a whole subtree, not a single replaceable image.
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    <div role="img" aria-label={describeQuerySeries(rows, columns)}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={plotRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 5" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: "var(--ink-faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval={0}
            angle={rows.length > 5 ? -18 : 0}
            textAnchor={rows.length > 5 ? "end" : "middle"}
            height={rows.length > 5 ? 44 : 24}
          />
          {/* A single shared axis — see the same comment in QueryLineChart
              on why two or more metrics are plotted pre-indexed to each
              metric's first value (100 = its own starting point) rather
              than each getting its own hidden, unlabeled scale. */}
          <YAxis
            tick={{ fill: "var(--ink-faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={indexed ? (v: number) => `${Math.round(v)}%` : undefined}
          />
          <Tooltip content={<ChartTooltip columns={columns} />} cursor={{ fill: "var(--surface-2)" }} />
          {valueCols.map((col, i) => (
            <Bar
              key={col.key}
              dataKey={col.key}
              fill={CHART_COLORS[i % CHART_COLORS.length]}
              radius={[6, 6, 0, 0]}
              maxBarSize={44}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
