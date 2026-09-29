import type { PivotRow } from "@apicem/api-contract";

/**
 * One node in the row-group tree the pivot table renders. A "group" node
 * (has `children`) represents one value at one Rows-shelf nesting level and
 * is collapsible; a "leaf" node (has `leaf` instead) is a fully-specified
 * combination of every Rows dimension and carries the real cell values
 * pivotResult computed for it. `subtotal` is present on every node — for a
 * leaf it's just that leaf's own cells; for a group it's the sum across
 * every descendant leaf, computed once here rather than re-summed on every
 * render or every time a group is expanded.
 */
export interface PivotRowNode {
  value: string;
  depth: number;
  /** Unique across the whole tree — dimension values joined by " / ", used both as the React key and as the expand/collapse state's identity. */
  path: string;
  children?: PivotRowNode[];
  leaf?: PivotRow;
  subtotal: Record<string, number>;
}

function sumCells(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) {
    out[key] = Math.round(((out[key] ?? 0) + value) * 100) / 100;
  }
  return out;
}

/**
 * Groups pivotResult's flat rows (one per full combination of every Rows
 * dimension — see PivotResult's own doc comment) into a nested tree, one
 * level per dimension. `dimensionCount === 0` (nothing on Rows) returns an
 * empty tree — the caller renders that single grand-total case directly
 * from `rows[0]` instead, same as before this tree existed.
 */
export function buildPivotRowTree(rows: PivotRow[], dimensionCount: number): PivotRowNode[] {
  if (dimensionCount === 0 || rows.length === 0) return [];

  function group(rowsAtLevel: PivotRow[], depth: number, pathPrefix: string): PivotRowNode[] {
    const isLeafLevel = depth === dimensionCount - 1;
    const buckets = new Map<string, PivotRow[]>();
    for (const row of rowsAtLevel) {
      const value = row.rowValues[depth];
      const bucket = buckets.get(value);
      if (bucket) bucket.push(row);
      else buckets.set(value, [row]);
    }
    return Array.from(buckets.entries()).map(([value, groupRows]) => {
      const path = pathPrefix ? `${pathPrefix} / ${value}` : value;
      if (isLeafLevel) {
        return { value, depth, path, leaf: groupRows[0], subtotal: groupRows[0].cells };
      }
      const children = group(groupRows, depth + 1, path);
      const subtotal = children.reduce((acc, child) => sumCells(acc, child.subtotal), {} as Record<string, number>);
      return { value, depth, path, children, subtotal };
    });
  }

  return group(rows, 0, "");
}

/** Every collapsible (non-leaf) node's path, depth-first — the full set to expand everything or nothing at once. */
export function allGroupPaths(nodes: PivotRowNode[]): string[] {
  return nodes.flatMap((node) => (node.children ? [node.path, ...allGroupPaths(node.children)] : []));
}

/**
 * Flattens the tree into the ordered list of nodes to actually render — a
 * `<table>` needs one flat list of sibling `<tr>`s, not real nested JSX.
 * A collapsed group contributes only itself (its subtotal row); an
 * expanded one contributes itself plus its children's own visible rows.
 */
export function visiblePivotRows(nodes: PivotRowNode[], expandedPaths: ReadonlySet<string>): PivotRowNode[] {
  return nodes.flatMap((node) => {
    if (!node.children) return [node];
    return expandedPaths.has(node.path) ? [node, ...visiblePivotRows(node.children, expandedPaths)] : [node];
  });
}
