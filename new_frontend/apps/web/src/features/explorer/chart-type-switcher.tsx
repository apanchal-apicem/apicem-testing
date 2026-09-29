import { BarChart3, Gauge, LineChart, Table2 } from "lucide-react";
import type { ChartType } from "@apicem/api-contract";
import { cn } from "@/lib/utils";

const options: { type: ChartType; icon: typeof LineChart; label: string }[] = [
  { type: "kpi", icon: Gauge, label: "Single value" },
  { type: "line", icon: LineChart, label: "Line" },
  { type: "bar", icon: BarChart3, label: "Bar" },
  { type: "table", icon: Table2, label: "Table" },
];

export function ChartTypeSwitcher({ value, onChange }: { value: ChartType; onChange: (t: ChartType) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-surface-2 p-1">
      {options.map((opt) => (
        <button
          key={opt.type}
          title={opt.label}
          aria-label={opt.label}
          aria-pressed={value === opt.type}
          onClick={() => onChange(opt.type)}
          className={cn(
            "flex size-7 items-center justify-center rounded-full transition-colors",
            value === opt.type ? "bg-surface text-ink shadow-sm" : "text-ink-faint hover:text-ink",
          )}
        >
          <opt.icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
