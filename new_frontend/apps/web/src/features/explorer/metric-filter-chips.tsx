import { cn } from "@/lib/utils";
import type { FieldRef } from "./field-chip";

/**
 * Shown whenever 2+ metrics sit on Build tab's Value shelf — narrows the
 * active visual to one metric instead of always showing every selected
 * metric combined. This matters most for the Single value (KPI) visual:
 * a tile can only ever headline one number, so without an explicit choice
 * it silently showed whichever metric happened to be first. "All" restores
 * the combined view (every line/bar/column, or one KPI tile per metric).
 */
export function MetricFilterChips({
  metrics,
  value,
  onChange,
}: {
  metrics: FieldRef[];
  value: string | "all";
  onChange: (next: string | "all") => void;
}) {
  if (metrics.length < 2) return null;

  return (
    <div className="inline-flex flex-wrap items-center gap-0.5 rounded-full bg-surface-2 p-1">
      <button
        type="button"
        onClick={() => onChange("all")}
        aria-pressed={value === "all"}
        className={cn(
          "rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
          value === "all" ? "bg-surface text-ink shadow-sm" : "text-ink-faint hover:text-ink",
        )}
      >
        All
      </button>
      {metrics.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          aria-pressed={value === m.id}
          className={cn(
            "rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
            value === m.id ? "bg-surface text-ink shadow-sm" : "text-ink-faint hover:text-ink",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
