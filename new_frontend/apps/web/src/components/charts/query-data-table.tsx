import type { QueryColumn } from "@apicem/api-contract";
import { formatByType } from "@/lib/format";
import { cn } from "@/lib/utils";

export function QueryDataTable({
  rows,
  columns,
  dense,
  className,
}: {
  rows: Array<Record<string, string | number>>;
  columns: QueryColumn[];
  dense?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("scrollbar-thin overflow-auto rounded-(--radius-md) border border-border", className)}>
      <table className="w-full border-collapse text-left text-[13px]">
        <thead className="sticky top-0 bg-surface-2">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "whitespace-nowrap px-3.5 py-2 font-medium text-ink-soft",
                  col.type === "number" || col.type === "currency" ? "text-right" : "text-left",
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border transition-colors hover:bg-surface-2/60">
              {columns.map((col) => {
                const raw = row[col.key];
                const isNumeric = col.type === "number" || col.type === "currency";
                const display =
                  isNumeric && typeof raw === "number" ? formatByType(raw, col.type === "currency" ? "currency" : "number") : raw;
                return (
                  <td
                    key={col.key}
                    className={cn(
                      "tabular whitespace-nowrap px-3.5 text-ink",
                      dense ? "py-1.5" : "py-2.5",
                      isNumeric ? "text-right" : "text-left",
                    )}
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
