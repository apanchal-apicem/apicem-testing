import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { SchemaTable } from "@apicem/api-contract";
import { cn } from "@/lib/utils";

const typeBadge: Record<string, string> = {
  string: "text-ink-faint",
  number: "text-info",
  currency: "text-success",
  date: "text-accent-ink",
  boolean: "text-ink-faint",
};

export function SchemaTablesList({ tables }: { tables: SchemaTable[] }) {
  const [open, setOpen] = useState<string | null>(tables[0]?.name ?? null);

  return (
    <div className="divide-y divide-border rounded-(--radius-md) border border-border">
      {tables.map((table) => {
        const isOpen = open === table.name;
        return (
          <div key={table.name}>
            <button
              onClick={() => setOpen(isOpen ? null : table.name)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-[13px] font-medium text-ink">{table.name}</span>
                <span className="text-[12px] text-ink-faint">{table.rowCount.toLocaleString()} rows</span>
              </span>
              <ChevronDown className={cn("size-4 text-ink-faint transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 bg-surface-2/60 px-4 pb-3.5 pt-1 sm:grid-cols-3">
                {table.columns.map((col) => (
                  <div key={col.name} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="truncate font-mono text-ink-soft">{col.name}</span>
                    <span className={cn("shrink-0 font-mono text-[11px] uppercase", typeBadge[col.type])}>{col.type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
