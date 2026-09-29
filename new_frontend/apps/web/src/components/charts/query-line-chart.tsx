import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { QueryColumn } from "@apicem/api-contract";
import { ChartTooltip } from "./chart-tooltip";
import { indexToFirstPeriod, valueColumns, type ChartHeight } from "./chart-types";
import { describeQuerySeries } from "./chart-summary";

// One color per value column, cycling through the 6 chart tokens theme.css
// defines (see theme.css's --chart-1..6) — matches the 6-metric cap the
// engine and the report builder's multi-select both enforce.
const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

export function QueryLineChart({
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
        <AreaChart data={plotRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            {valueCols.map((col, i) => (
              <linearGradient key={col.key} id={`line-fill-${col.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0.22} />
                <stop offset="100%" stopColor={CHART_COLORS[i % CHART_COLORS.length]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 5" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: "var(--ink-faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={(v) => String(v).slice(5)}
            minTickGap={24}
          />
          {/* A single metric gets one axis with its own real-value domain.
              Two or more metrics share one axis too, but plotting rows
              already indexed to each metric's first value (see
              indexToFirstPeriod) — giving each metric its own hidden
              per-series axis instead would let every line fill the chart
              height on its own invisible scale, with only one metric's
              real numbers ever printed, making every other line look like
              it was measured on that metric's scale even though it wasn't. */}
          <YAxis
            tick={{ fill: "var(--ink-faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={indexed ? (v: number) => `${Math.round(v)}%` : undefined}
            domain={
              indexed
                ? undefined
                : [(min: number) => Math.floor(min - (min === 0 ? 0 : min * 0.08)), (max: number) => Math.ceil(max * 1.06)]
            }
          />
          <Tooltip content={<ChartTooltip columns={columns} />} cursor={{ stroke: "var(--border-strong)" }} />
          {valueCols.map((col, i) => {
            const color = CHART_COLORS[i % CHART_COLORS.length];
            return (
              <Area
                key={col.key}
                type="monotone"
                dataKey={col.key}
                stroke={color}
                strokeWidth={2}
                fill={`url(#line-fill-${col.key})`}
                dot={false}
                activeDot={{ r: 4, fill: color }}
                isAnimationActive={false}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
