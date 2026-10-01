import type { FieldRef } from "./field-chip";

/**
 * Standard set of dimensions supported across the Query Engine, Build tab,
 * Pivot table, and Report Builder.
 */
export const STANDARD_DIMENSIONS: FieldRef[] = [
  { kind: "dimension", id: "channel", label: "Channel" },
  { kind: "dimension", id: "category", label: "Category" },
  { kind: "dimension", id: "product", label: "Product" },
  { kind: "dimension", id: "campaign", label: "Campaign" },
  { kind: "dimension", id: "date", label: "Date" },
];
