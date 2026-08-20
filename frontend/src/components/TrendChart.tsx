import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "../lib/format";

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
}

function formatDate(value: string) {
  const d = new Date(value);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatAxisCurrency(value: number) {
  if (value >= 1000) return `$${(value / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`;
  return `$${value}`;
}

function CustomTooltip({ active, payload, label, series }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
      }}
    >
      <div style={{ color: "var(--text-secondary)", marginBottom: 4 }}>{formatDate(label)}</div>
      {payload.map((entry: any) => {
        const seriesLabel = series.find((s: TrendSeries) => s.key === entry.dataKey)?.label || entry.dataKey;
        return (
          <div key={entry.dataKey} style={{ color: "var(--text-primary)" }}>
            <span className="swatch" style={{ background: entry.stroke, display: "inline-block" }} />
            {seriesLabel}: {formatCurrency(Number(entry.value))}
          </div>
        );
      })}
    </div>
  );
}

/** Generic 2-series-or-fewer time trend -- backs both Revenue Trend (gross/net revenue)
 * and Ad Spend Trend (Google/Meta spend), which share the identical shape and only differ
 * in field names and colors. */
export function TrendChart({ data, series }: { data: Record<string, any>[]; series: TrendSeries[] }) {
  if (!data?.length) {
    return <div className="muted">No data for this period yet.</div>;
  }

  return (
    <div>
      <div className="legend">
        {series.map((s) => (
          <span key={s.key}>
            <span className="swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={264}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--gridline)" />
          <XAxis
            dataKey="date_key"
            tickFormatter={formatDate}
            stroke="var(--baseline)"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--baseline)" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={[0, "auto"]}
            tickFormatter={formatAxisCurrency}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={52}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip series={series} />} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
