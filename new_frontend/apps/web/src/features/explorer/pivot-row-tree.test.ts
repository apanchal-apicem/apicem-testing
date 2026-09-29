import { describe, expect, it } from "vitest";
import type { PivotRow } from "@apicem/api-contract";
import { allGroupPaths, buildPivotRowTree, visiblePivotRows } from "./pivot-row-tree";

const rows: PivotRow[] = [
  { rowKey: "Meta Ads / Outerwear", rowValues: ["Meta Ads", "Outerwear"], cells: { met_revenue: 100 } },
  { rowKey: "Meta Ads / Footwear", rowValues: ["Meta Ads", "Footwear"], cells: { met_revenue: 50 } },
  { rowKey: "Google Ads / Outerwear", rowValues: ["Google Ads", "Outerwear"], cells: { met_revenue: 30 } },
];

describe("buildPivotRowTree", () => {
  it("groups flat rows into one nested level per dimension", () => {
    const tree = buildPivotRowTree(rows, 2);
    expect(tree.map((n) => n.value)).toEqual(["Meta Ads", "Google Ads"]);
    expect(tree[0].children?.map((c) => c.value)).toEqual(["Outerwear", "Footwear"]);
    expect(tree[0].children?.[0].leaf?.rowKey).toBe("Meta Ads / Outerwear");
  });

  it("sums a group's subtotal from its descendant leaves rather than re-deriving it elsewhere", () => {
    const tree = buildPivotRowTree(rows, 2);
    expect(tree[0].subtotal.met_revenue).toBe(150); // Meta Ads: 100 + 50
    expect(tree[1].subtotal.met_revenue).toBe(30); // Google Ads: only Outerwear
  });

  it("gives a leaf node its own cells as its subtotal, unchanged", () => {
    const tree = buildPivotRowTree(rows, 2);
    expect(tree[0].children?.[0].subtotal).toEqual({ met_revenue: 100 });
  });

  it("returns an empty tree when there are no Rows dimensions, leaving the grand-total case to the caller", () => {
    expect(buildPivotRowTree(rows, 0)).toEqual([]);
  });

  it("degenerates to a flat list of leaves with no children when there's only one Rows dimension", () => {
    const singleDimRows: PivotRow[] = [
      { rowKey: "Meta Ads", rowValues: ["Meta Ads"], cells: { met_revenue: 150 } },
      { rowKey: "Google Ads", rowValues: ["Google Ads"], cells: { met_revenue: 30 } },
    ];
    const tree = buildPivotRowTree(singleDimRows, 1);
    expect(tree.every((n) => n.children === undefined)).toBe(true);
    expect(tree.map((n) => n.leaf?.rowKey)).toEqual(["Meta Ads", "Google Ads"]);
  });

  it("builds unique paths by joining each level's value, for use as expand/collapse identity", () => {
    const tree = buildPivotRowTree(rows, 2);
    expect(tree[0].path).toBe("Meta Ads");
    expect(tree[0].children?.[0].path).toBe("Meta Ads / Outerwear");
  });
});

describe("allGroupPaths", () => {
  it("lists every collapsible node's path, depth-first, excluding leaves", () => {
    const tree = buildPivotRowTree(rows, 2);
    expect(allGroupPaths(tree)).toEqual(["Meta Ads", "Google Ads"]);
  });

  it("is empty when there's only one dimension, since every node is already a leaf", () => {
    const tree = buildPivotRowTree(rows.slice(0, 1).map((r) => ({ ...r, rowValues: [r.rowValues[0]] })), 1);
    expect(allGroupPaths(tree)).toEqual([]);
  });
});

describe("visiblePivotRows", () => {
  it("shows only the top-level subtotal for a collapsed group, hiding its children", () => {
    const tree = buildPivotRowTree(rows, 2);
    const visible = visiblePivotRows(tree, new Set());
    expect(visible.map((n) => n.path)).toEqual(["Meta Ads", "Google Ads"]);
  });

  it("shows a group's children once it's in the expanded set", () => {
    const tree = buildPivotRowTree(rows, 2);
    const visible = visiblePivotRows(tree, new Set(["Meta Ads"]));
    expect(visible.map((n) => n.path)).toEqual(["Meta Ads", "Meta Ads / Outerwear", "Meta Ads / Footwear", "Google Ads"]);
  });

  it("expands every level at once when every group path is in the expanded set", () => {
    const tree = buildPivotRowTree(rows, 2);
    const visible = visiblePivotRows(tree, new Set(allGroupPaths(tree)));
    expect(visible).toHaveLength(rows.length + allGroupPaths(tree).length);
  });
});
