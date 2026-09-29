import type { QueryColumn } from "@apicem/api-contract";
import { formatByType } from "@/lib/format";

/**
 * A multi-metric or cross-tab result renders one <Area>/<Bar> per value
 * column (see QueryLineChart/QueryBarChart), so Recharts hands the tooltip
 * one payload entry per series currently hovered, not always exactly one —
 * each entry is matched back to its column by `dataKey` so the right label
 * and number format apply to each.
 *
 * When 2+ metrics are charted, the plotted value is an index (first row =
 * 100), not the real number — see `indexToFirstPeriod` in chart-types.ts.
 * `entry.payload` is Recharts' term for the full data row behind this
 * point, which still carries the real value under `${dataKey}__raw`; the
 * tooltip always shows that ground-truth number, never the index.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  columns,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey?: string; color?: string; payload?: Record<string, string | number> }>;
  label?: string;
  columns: QueryColumn[];
}) {
  if (!active || !payload?.length) return null;
  const multi = payload.length > 1;

  return (
    <div className="rounded-(--radius-sm) border border-border bg-surface px-3 py-2 text-[12.5px] shadow-lg">
      <p className="mb-1 font-medium text-ink-soft">{label}</p>
      <div className="space-y-0.5">
        {payload.map((entry) => {
          const col = columns.find((c) => c.key === entry.dataKey) ?? columns[1];
          const format = col?.type === "currency" ? "currency" : "number";
          const raw = entry.dataKey ? entry.payload?.[`${entry.dataKey}__raw`] : undefined;
          const value = typeof raw === "number" ? raw : entry.value;
          return (
            <p key={entry.dataKey ?? "value"} className="flex items-center gap-1.5 tabular font-semibold text-ink">
              {multi && <span className="size-2 shrink-0 rounded-full" style={{ background: entry.color }} />}
              {multi && <span className="font-normal text-ink-soft">{col?.label}:</span>}
              {formatByType(value, format)}
            </p>
          );
        })}
      </div>
    </div>
  );
}
