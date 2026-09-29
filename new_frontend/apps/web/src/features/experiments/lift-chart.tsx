import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCompact } from "@/lib/format";
import { describeLiftSeries } from "@/components/charts/chart-summary";

export function LiftChart({
  treatmentSeries,
  holdoutSeries,
}: {
  treatmentSeries: Array<{ date: string; value: number }>;
  holdoutSeries: Array<{ date: string; value: number }>;
}) {
  const rows = treatmentSeries.map((t, i) => ({
    date: t.date,
    treatment: t.value,
    holdout: holdoutSeries[i]?.value,
  }));

  return (
    // Recharts' SVG carries no accessible content of its own; role="img"
    // with a computed summary gives a screen reader the trend and range
    // instead of an unlabeled pile of internal chart nodes. A real <img>
    // isn't an option: it can't have children, and the chart it would need
    // to replace is a whole subtree, not a single replaceable image.
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    <div role="img" aria-label={describeLiftSeries(treatmentSeries, holdoutSeries)}>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 5" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "var(--ink-faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={(v) => String(v).slice(5)}
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: "var(--ink-faint)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(v) => formatCompact(v)}
            domain={[(min: number) => Math.floor(min - (min === 0 ? 0 : min * 0.06)), (max: number) => Math.ceil(max * 1.06)]}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12.5,
            }}
            labelStyle={{ color: "var(--ink-soft)", marginBottom: 4 }}
            formatter={(value, name) => [
              typeof value === "number" ? formatCompact(value) : String(value),
              name === "treatment" ? "Treatment" : "Holdout",
            ]}
          />
          <Legend
            formatter={(value) => (value === "treatment" ? "Treatment" : "Holdout")}
            wrapperStyle={{ fontSize: 12.5, color: "var(--ink-soft)" }}
          />
          <Line type="monotone" dataKey="treatment" stroke="var(--accent)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="holdout"
            stroke="var(--ink-faint)"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
