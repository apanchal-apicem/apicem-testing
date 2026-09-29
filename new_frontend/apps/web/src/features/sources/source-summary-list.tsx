import type { DataSource } from "@apicem/api-contract";
import { getSourceMeta } from "./source-meta";
import { StatusDot } from "@/components/ui/status-dot";

export function SourceSummaryList({ sources }: { sources: DataSource[] }) {
  return (
    <ul className="space-y-0.5">
      {sources.map((source) => {
        const meta = getSourceMeta(source.type);
        return (
          <li key={source.id} className="flex items-center gap-2.5 rounded-(--radius-sm) px-2.5 py-2">
            <span className="flex size-7 items-center justify-center rounded-(--radius-sm) bg-surface-2 text-ink-soft">
              <meta.icon className="size-3.5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">{source.name}</span>
              <StatusDot status={source.status} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
