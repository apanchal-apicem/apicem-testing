import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { MetricFormat, PivotColumnGroup, PivotResult } from "@apicem/api-contract";
import { formatByType } from "@/lib/format";
import { cn } from "@/lib/utils";
import { allGroupPaths, buildPivotRowTree, visiblePivotRows, type PivotRowNode } from "./pivot-row-tree";

function pivotCellKey(columnGroupKey: string | undefined, metricId: string): string {
  return columnGroupKey ? `${columnGroupKey}::${metricId}` : metricId;
}

/** One cell per (column group x metric) combination, or one per metric when there are no column groups — shared by the body and the totals row so the two can never drift out of sync on how a cell is keyed or formatted. */
function pivotCells(
  cells: Record<string, number>,
  columnGroups: PivotColumnGroup[],
  metricIds: string[],
  metricFormats: Record<string, MetricFormat>,
  emphasize: boolean,
) {
  const cellClass = cn("tabular border-b border-l border-border px-3 py-2 text-right text-ink", emphasize && "font-semibold");
  const groups = columnGroups.length > 0 ? columnGroups : [undefined];
  return groups.flatMap((group) =>
    metricIds.map((id) => (
      <td key={`${group?.key ?? "_"}::${id}`} className={cellClass}>
        {formatByType(cells[pivotCellKey(group?.key, id)] ?? 0, metricFormats[id])}
      </td>
    )),
  );
}

/**
 * A real pivot table: nested-looking column headers (a top row of column
 * groups, spanning one sub-column per metric underneath), collapsible row
 * groups — one level per Rows dimension, indented rather than one column
 * per dimension — and a grand-total row. Rendered as a plain HTML table:
 * the tree (see pivot-row-tree.ts) is flattened to whichever nodes are
 * currently visible, since a <table> needs one flat list of sibling <tr>s,
 * not real nested JSX.
 */
export function PivotTableView({ result }: { result: PivotResult }) {
  const { rowDimensions, columnGroups, metricIds, metricLabels, metricFormats, rows, totals } = result;
  const hasColumnGroups = columnGroups.length > 0;
  const showMetricSubheader = hasColumnGroups && metricIds.length > 1;

  const tree = useMemo(() => buildPivotRowTree(rows, rowDimensions.length), [rows, rowDimensions.length]);
  const groupPaths = useMemo(() => allGroupPaths(tree), [tree]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(groupPaths));

  // Resets to fully expanded only when the *set of Rows dimensions itself*
  // changes (a group's paths from the old dimensions wouldn't mean anything
  // against the new ones anyway) — not on every metric or column tweak,
  // which would otherwise throw away a manually collapsed group for an
  // unrelated change elsewhere on the shelves.
  const rowDimensionKey = rowDimensions.map((d) => d.key).join(",");
  useEffect(() => {
    setExpanded(new Set(allGroupPaths(buildPivotRowTree(rows, rowDimensions.length))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowDimensionKey]);

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  const visible = visiblePivotRows(tree, expanded);
  const allExpanded = groupPaths.length > 0 && groupPaths.every((p) => expanded.has(p));
  const rowLabel = rowDimensions.map((d) => d.label).join(" / ");

  return (
    <div className="space-y-2">
      {groupPaths.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setExpanded(allExpanded ? new Set() : new Set(groupPaths))}
            className="text-[12px] font-medium text-accent-ink hover:underline"
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </button>
        </div>
      )}
      <div className="scrollbar-thin overflow-x-auto rounded-(--radius-md) border border-border">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th
                rowSpan={showMetricSubheader ? 2 : 1}
                className="border-b border-border bg-surface-2 px-3 py-2 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint"
              >
                {rowLabel || <span className="sr-only">Row</span>}
              </th>
              {hasColumnGroups
                ? columnGroups.map((group) => (
                    <th
                      key={group.key}
                      colSpan={metricIds.length}
                      className="border-b border-l border-border bg-surface-2 px-3 py-2 text-left text-[12.5px] font-semibold text-ink"
                    >
                      {group.label}
                    </th>
                  ))
                : metricIds.map((id) => (
                    <th key={id} className="border-b border-l border-border bg-surface-2 px-3 py-2 text-right text-[12.5px] font-semibold text-ink">
                      {metricLabels[id]}
                    </th>
                  ))}
            </tr>
            {showMetricSubheader && (
              <tr>
                {columnGroups.flatMap((group) =>
                  metricIds.map((id) => (
                    <th
                      key={`${group.key}::${id}`}
                      className="border-b border-l border-border bg-surface-2 px-3 py-1.5 text-right text-[11.5px] font-medium text-ink-faint"
                    >
                      {metricLabels[id]}
                    </th>
                  )),
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {rowDimensions.length === 0
              ? rows.map((row, i) => (
                  <tr key={row.rowKey} className={cn(i % 2 === 1 && "bg-surface-2/40")}>
                    <td className="border-b border-border px-3 py-2 text-ink">{row.rowKey}</td>
                    {pivotCells(row.cells, columnGroups, metricIds, metricFormats, false)}
                  </tr>
                ))
              : visible.map((node: PivotRowNode) => (
                  <tr key={node.path} className={cn(node.children ? "bg-surface-2/60" : "odd:bg-surface-2/20")}>
                    <td className="border-b border-border px-3 py-2 text-ink" style={{ paddingLeft: 12 + node.depth * 18 }}>
                      <span className="flex items-center gap-1.5">
                        {node.children ? (
                          <button
                            type="button"
                            onClick={() => toggle(node.path)}
                            aria-expanded={expanded.has(node.path)}
                            aria-label={`${expanded.has(node.path) ? "Collapse" : "Expand"} ${node.value}`}
                            className="flex size-4 shrink-0 items-center justify-center text-ink-faint hover:text-ink"
                          >
                            <ChevronRight className={cn("size-3.5 transition-transform", expanded.has(node.path) && "rotate-90")} />
                          </button>
                        ) : (
                          <span className="size-4 shrink-0" />
                        )}
                        <span className={cn(node.children && "font-semibold")}>{node.value}</span>
                      </span>
                    </td>
                    {pivotCells(node.children ? node.subtotal : node.leaf!.cells, columnGroups, metricIds, metricFormats, Boolean(node.children))}
                  </tr>
                ))}
          </tbody>
          <tfoot>
            <tr className="bg-surface-2">
              <td className="px-3 py-2 text-[12.5px] font-semibold text-ink">Total</td>
              {pivotCells(totals, columnGroups, metricIds, metricFormats, true)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
