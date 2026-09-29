import { TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { formatByType } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MetricFormat } from "@apicem/api-contract";

export function KpiTile({
  label,
  value,
  format,
  delta,
  series,
  className,
}: {
  label: string;
  value: number;
  format: MetricFormat;
  delta?: number;
  series?: number[];
  className?: string;
}) {
  const isPositive = (delta ?? 0) >= 0;
  return (
    <div className={cn("flex flex-col justify-between rounded-(--radius-lg) border border-border bg-surface p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-medium text-ink-soft">{label}</p>
        {series && series.length > 1 && (
          // Decorative: the delta text below already states the trend and
          // magnitude in words, so this would only repeat it, not add
          // anything — hidden rather than given a redundant description.
          <div aria-hidden="true" className="h-8 w-16 opacity-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series.map((v) => ({ v }))}>
                <defs>
                  <linearGradient id={`spark-${label.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  fill={`url(#spark-${label.replace(/\s/g, "")})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <p className="tabular mt-2 font-display text-[26px] font-bold leading-tight text-ink">
        {formatByType(value, format)}
      </p>
      {delta !== undefined && (
        <p
          className={cn(
            "tabular mt-1 flex items-center gap-1 text-[12.5px] font-medium",
            isPositive ? "text-success" : "text-danger",
          )}
        >
          {isPositive ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
          {Math.abs(delta).toFixed(1)}% vs. prior period
        </p>
      )}
    </div>
  );
}
