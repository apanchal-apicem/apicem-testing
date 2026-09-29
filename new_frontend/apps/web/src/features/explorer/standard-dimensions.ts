import type { FieldRef } from "./field-chip";

/**
 * The fixed, small set of dimensions the mock query engine actually knows
 * how to break a metric down by (see dimensionPresetKeys in mock/fixtures.ts)
 * — shared by the Build tab's own Dimensions list and by the report
 * builder's block-editing popover, so both offer exactly the breakdowns a
 * query can actually resolve, not a list either one invented independently.
 */
export const STANDARD_DIMENSIONS: FieldRef[] = [
  { kind: "dimension", id: "channel", label: "Channel" },
  { kind: "dimension", id: "category", label: "Category" },
  { kind: "dimension", id: "product", label: "Product" },
];
