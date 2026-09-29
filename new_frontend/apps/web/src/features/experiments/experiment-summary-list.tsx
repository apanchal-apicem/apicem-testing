import { FlaskConical, TrendingDown, TrendingUp } from "lucide-react";
import type { Experiment } from "@apicem/api-contract";
import { ExperimentStatusBadge } from "./experiment-status-badge";
import { cn } from "@/lib/utils";

export function ExperimentSummaryList({ experiments }: { experiments: Experiment[] }) {
  return (
    <ul className="space-y-0.5">
      {experiments.map((exp) => {
        const lift = exp.result?.liftPct;
        const isPositive = (lift ?? 0) >= 0;
        return (
          <li key={exp.id} className="flex items-center gap-2.5 rounded-(--radius-sm) px-2.5 py-2">
            <span className="flex size-7 items-center justify-center rounded-(--radius-sm) bg-surface-2 text-ink-soft">
              <FlaskConical className="size-3.5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">{exp.name}</span>
              <ExperimentStatusBadge status={exp.status} />
            </span>
            {lift !== undefined && (
              <span className={cn("flex shrink-0 items-center gap-1 text-[12px] font-medium", isPositive ? "text-success" : "text-danger")}>
                {isPositive ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                {Math.abs(lift * 100).toFixed(1)}%
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
