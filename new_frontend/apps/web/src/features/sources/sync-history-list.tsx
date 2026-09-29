import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { SyncRun } from "@apicem/api-contract";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const statusIcon = {
  success: { icon: CheckCircle2, className: "text-success" },
  failed: { icon: AlertTriangle, className: "text-danger" },
  running: { icon: Loader2, className: "text-info animate-spin" },
} as const;

export function SyncHistoryList({ runs }: { runs: SyncRun[] }) {
  if (runs.length === 0) {
    return <p className="py-6 text-center text-[13px] text-ink-faint">No sync runs recorded yet.</p>;
  }

  return (
    <div className="divide-y divide-border rounded-(--radius-md) border border-border">
      {runs.map((run) => {
        const meta = statusIcon[run.status];
        const Icon = meta.icon;
        return (
          <div key={run.id} className="flex items-start gap-3 px-4 py-3">
            <Icon className={cn("mt-0.5 size-4 shrink-0", meta.className)} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                <span className="font-medium text-ink capitalize">{run.status}</span>
                <span className="text-ink-faint">· attempt {run.attempt}</span>
                <span className="text-ink-faint">· {formatRelativeTime(run.startedAt)}</span>
              </div>
              <p className="tabular mt-0.5 text-[12px] text-ink-soft">
                {run.rowsUpserted.toLocaleString()} rows upserted
              </p>
              {run.errorMessage && <p className="mt-1 text-[12px] text-danger">{run.errorMessage}</p>}
              <p className="mt-1 font-mono text-[11px] text-ink-faint">idempotency key: {run.idempotencyKey}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
