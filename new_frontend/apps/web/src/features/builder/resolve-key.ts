/** A block's `config` is a loose bag shaped by its own block type — this is the one place that turns it into the {source, key} reference `getBlockData` (and the block-editing popover) actually resolve against. */
export function resolveKey(config: Record<string, unknown>): { source: "metric" | "preset"; key: string } | null {
  if (typeof config.key === "string") return { source: (config.source as "metric" | "preset") ?? "metric", key: config.key };
  if (typeof config.metricId === "string") return { source: "metric", key: config.metricId };
  if (typeof config.presetKey === "string") return { source: "preset", key: config.presetKey };
  return null;
}
