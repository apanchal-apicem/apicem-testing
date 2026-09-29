import { cn } from "@/lib/utils";
import type { DataSourceStatus } from "@apicem/api-contract";

const statusMeta: Record<DataSourceStatus, { color: string; label: string }> = {
  connected: { color: "bg-success", label: "Connected" },
  syncing: { color: "bg-info", label: "Syncing" },
  error: { color: "bg-danger", label: "Needs attention" },
  pending: { color: "bg-ink-faint", label: "Not connected" },
};

export function StatusDot({ status, className }: { status: DataSourceStatus; className?: string }) {
  const meta = statusMeta[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] text-ink-soft", className)}>
      <span className={cn("size-1.5 rounded-full", meta.color, status === "syncing" && "animate-pulse")} />
      {meta.label}
    </span>
  );
}
