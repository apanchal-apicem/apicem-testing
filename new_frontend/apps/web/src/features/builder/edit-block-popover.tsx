import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import type { ChartType, ReportBlock } from "@apicem/api-contract";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChartTypeSwitcher } from "@/features/explorer/chart-type-switcher";
import { STANDARD_DIMENSIONS } from "@/features/explorer/standard-dimensions";
import { useBlockData, useMetrics, useRunQuery } from "@/api/hooks";
import { builderActions, useAppDispatch } from "@/store";
import { resolveKey } from "./resolve-key";
import { cn } from "@/lib/utils";

const METRIC_PREFIX = "metric:";
const DIMENSION_PREFIX = "dimension:";

/**
 * Reverses a block's current {source, key} reference back into the metric
 * and dimension ids that produced it, so reopening the popover on a
 * multi-metric/cross-tab block re-checks the same boxes rather than
 * starting blank. The composite key formats (multi:/bydim:/crosstab:, see
 * resolveQuery's doc comment in mock/fixtures.ts) are self-describing; a
 * legacy single-dimension preset key (e.g. "cac_channel") isn't, so that
 * case is left undecoded — same limitation "Currently: <summary>" already
 * covers below.
 */
function decodeSelection(
  ref: { source: "metric" | "preset"; key: string } | null,
): { metricIds: string[]; dimensionIds: string[] } {
  if (!ref) return { metricIds: [], dimensionIds: [] };
  if (ref.source === "metric")
    return { metricIds: [ref.key], dimensionIds: [] };
  if (ref.key.startsWith("multi:"))
    return { metricIds: ref.key.slice(6).split(","), dimensionIds: [] };
  if (ref.key.startsWith("bydim:")) {
    const [idsPart, dim] = ref.key.slice(6).split(":");
    return { metricIds: idsPart.split(","), dimensionIds: [dim] };
  }
  if (ref.key.startsWith("crosstab:")) {
    const [idsPart, dimsPart] = ref.key.slice(9).split(":");
    return { metricIds: idsPart.split(","), dimensionIds: dimsPart.split(",") };
  }
  return { metricIds: [], dimensionIds: [] };
}

/**
 * The one way to change what a KPI, Chart, or Table block actually shows —
 * everything else about a selected block (BlockFrame's own delete button and
 * resize handle) only ever touched layout, never the underlying metric or
 * breakdown. Text and Image blocks don't need this: they already edit
 * inline, directly in the block.
 */
export function EditBlockPopover({ block }: { block: ReportBlock }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const dispatch = useAppDispatch();
  const { data: metrics = [] } = useMetrics();
  const runQuery = useRunQuery();

  const currentRef = resolveKey(block.config);
  const { data: current } = useBlockData(currentRef?.source, currentRef?.key);

  const config = block.config as {
    title?: string;
    label?: string;
    chartType?: ChartType;
  };
  const [title, setTitle] = useState("");
  const [chartType, setChartType] = useState<ChartType>("line");
  const [choice, setChoice] = useState("");
  const [metricIds, setMetricIds] = useState<string[]>([]);
  const [dimensionIds, setDimensionIds] = useState<string[]>([]);

  function toggleMetric(id: string) {
    setMetricIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }
  function toggleDimension(id: string) {
    setDimensionIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  }

  // Re-seeds the draft from the block's actual current values each time the
  // popover opens, rather than carrying over whatever was left from a
  // previous open-edit-cancel cycle (or a stale value from before the block
  // itself changed under it).
  useEffect(() => {
    if (!open) return;
    setTitle(config.title ?? config.label ?? "");
    setChartType(config.chartType ?? "line");
    // Only a metric source can be preselected on the KPI Select — a preset's
    // own dimension isn't something the frontend can look up from its key
    // alone (see dimensionPresetKeys' workspace-by-workspace mapping in
    // mock/fixtures.ts). "Currently: <summary>" below covers that case
    // instead of a wrong guess.
    setChoice(
      currentRef?.source === "metric"
        ? `${METRIC_PREFIX}${currentRef.key}`
        : "",
    );
    const decoded = decodeSelection(currentRef);
    setMetricIds(decoded.metricIds);
    setDimensionIds(decoded.dimensionIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    setSaving(true);
    try {
      let source: "metric" | "preset";
      let key: string;
      if (block.type === "kpi") {
        if (!choice) return;
        if (choice.startsWith(METRIC_PREFIX)) {
          source = "metric";
          key = choice.slice(METRIC_PREFIX.length);
        } else {
          const dimensionId = choice.slice(DIMENSION_PREFIX.length);
          const result = await runQuery.mutateAsync({
            dimensions: [dimensionId],
          });
          if (!result.resolvedKey) return;
          source = "preset";
          key = result.resolvedKey;
        }
      } else {
        if (metricIds.length === 0 && dimensionIds.length === 0) return;
        const result = await runQuery.mutateAsync({
          metricIds: metricIds.length > 0 ? metricIds : undefined,
          dimensions: dimensionIds.length > 0 ? dimensionIds : undefined,
        });
        if (!result.resolvedKey) return;
        source = metrics.some((m) => m.id === result.resolvedKey)
          ? "metric"
          : "preset";
        key = result.resolvedKey;
      }
      const config =
        block.type === "kpi"
          ? { source, key, label: title || undefined }
          : {
              source,
              key,
              title,
              ...(block.type === "chart" ? { chartType } : {}),
            };
      dispatch(builderActions.updateBlock({ id: block.id, patch: { config } }));
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    block.type === "kpi"
      ? Boolean(choice)
      : metricIds.length > 0 || dimensionIds.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          aria-label={`Edit ${block.type} block`}
          className="absolute -top-3 right-9 z-10 flex size-5 items-center justify-center rounded-full border border-border bg-surface text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Settings2 className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
          Edit {block.type}
        </p>
        {current && (
          <p className="mb-3 text-[12px] text-ink-soft">
            Currently: {current.summary}
          </p>
        )}

        <div className="space-y-3">
          {block.type === "kpi" ? (
            <div>
              <Label htmlFor={`block-show-${block.id}`}>Show</Label>
              <Select value={choice} onValueChange={setChoice}>
                <SelectTrigger id={`block-show-${block.id}`}>
                  <SelectValue placeholder="Choose what to show" />
                </SelectTrigger>
                <SelectContent>
                  {metrics.map((m) => (
                    <SelectItem key={m.id} value={`${METRIC_PREFIX}${m.id}`}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div>
                <p className="mb-1.5 text-[12.5px] font-medium tracking-wide text-ink-soft uppercase">
                  Metrics
                </p>
                <div className="scrollbar-thin max-h-36 space-y-1 overflow-y-auto rounded-(--radius-sm) border border-border p-2">
                  {metrics.map((m) => (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-2 rounded-(--radius-sm) px-1.5 py-1 text-[13px] text-ink hover:bg-surface-2"
                    >
                      <input
                        type="checkbox"
                        checked={metricIds.includes(m.id)}
                        onChange={() => toggleMetric(m.id)}
                        className="size-3.5 accent-accent"
                      />
                      {m.name}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[12.5px] font-medium tracking-wide text-ink-soft uppercase">
                  Breakdown by
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STANDARD_DIMENSIONS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDimension(d.id)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                        dimensionIds.includes(d.id)
                          ? "border-accent bg-accent-soft text-accent-ink"
                          : "border-border text-ink-soft hover:border-border-strong hover:bg-surface-2",
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <Label htmlFor={`block-title-${block.id}`}>
              {block.type === "kpi" ? "Label" : "Title"}
            </Label>
            <Input
              id={`block-title-${block.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {block.type === "chart" && (
            <div>
              <p className="mb-1.5 text-[12.5px] font-medium tracking-wide text-ink-soft uppercase">
                Chart type
              </p>
              <ChartTypeSwitcher value={chartType} onChange={setChartType} />
            </div>
          )}

          <Button
            size="sm"
            className="w-full"
            onClick={save}
            loading={saving}
            disabled={!canSave}
          >
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
