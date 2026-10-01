import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import type { ReportBlock } from "@apicem/api-contract";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { STANDARD_DIMENSIONS } from "@/features/explorer/standard-dimensions";
import { useMetrics, usePivotBlockData } from "@/api/hooks";
import { builderActions, useAppDispatch } from "@/store";
import { cn } from "@/lib/utils";

interface PivotBlockConfig {
  metricIds?: string[];
  rowDimensions?: string[];
  columnDimensions?: string[];
  title?: string;
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/**
 * A pivot block's config ({metricIds, rowDimensions, columnDimensions,
 * title}) has no {source, key} to resolve — unlike KPI/Chart/Table, saving
 * it is just writing those three arrays straight into config, with no
 * query-engine round trip needed first. That's also why this is its own
 * popover rather than another branch on EditBlockPopover: Rows and Columns
 * are two genuinely independent dimension shelves, not the single
 * metric/dimension choice every other block type edits.
 */
export function EditPivotBlockPopover({ block }: { block: ReportBlock }) {
  const [open, setOpen] = useState(false);
  const { data: metrics = [] } = useMetrics();
  const dispatch = useAppDispatch();
  const config = block.config as PivotBlockConfig;

  const [title, setTitle] = useState("");
  const [metricIds, setMetricIds] = useState<string[]>([]);
  const [rowDimensions, setRowDimensions] = useState<string[]>([]);
  const [columnDimensions, setColumnDimensions] = useState<string[]>([]);

  const { data: current } = usePivotBlockData(
    config.metricIds ?? [],
    config.rowDimensions ?? [],
    config.columnDimensions ?? [],
  );

  // Re-seeds the draft from the block's actual current values each time the
  // popover opens, same reasoning as EditBlockPopover's identical effect.
  useEffect(() => {
    if (!open) return;
    setTitle(config.title ?? "");
    setMetricIds(config.metricIds ?? []);
    setRowDimensions(config.rowDimensions ?? []);
    setColumnDimensions(config.columnDimensions ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function save() {
    dispatch(
      builderActions.updateBlock({
        id: block.id,
        patch: {
          config: {
            metricIds,
            rowDimensions,
            columnDimensions,
            title: title || undefined,
          },
        },
      }),
    );
    setOpen(false);
  }

  const canSave =
    metricIds.length > 0 ||
    rowDimensions.length > 0 ||
    columnDimensions.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          aria-label="Edit pivot block"
          className="absolute -top-3 right-9 z-10 flex size-5 items-center justify-center rounded-full border border-border bg-surface text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Settings2 className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
          Edit pivot table
        </p>
        {current && (
          <p className="mb-3 text-[12px] text-ink-soft">
            Currently: {current.summary}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <Label htmlFor={`pivot-title-${block.id}`}>Title</Label>
            <Input
              id={`pivot-title-${block.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <p className="mb-1.5 text-[12.5px] font-medium tracking-wide text-ink-soft uppercase">
              Metrics
            </p>
            <div className="scrollbar-thin max-h-32 space-y-1 overflow-y-auto rounded-(--radius-sm) border border-border p-2">
              {metrics.map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-2 rounded-(--radius-sm) px-1.5 py-1 text-[13px] text-ink hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    checked={metricIds.includes(m.id)}
                    onChange={() => setMetricIds(toggle(metricIds, m.id))}
                    className="size-3.5 accent-accent"
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[12.5px] font-medium tracking-wide text-ink-soft uppercase">
              Rows
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STANDARD_DIMENSIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setRowDimensions(toggle(rowDimensions, d.id))}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                    rowDimensions.includes(d.id)
                      ? "border-accent bg-accent-soft text-accent-ink"
                      : "border-border text-ink-soft hover:border-border-strong hover:bg-surface-2",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[12.5px] font-medium tracking-wide text-ink-soft uppercase">
              Columns
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STANDARD_DIMENSIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() =>
                    setColumnDimensions(toggle(columnDimensions, d.id))
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                    columnDimensions.includes(d.id)
                      ? "border-accent bg-accent-soft text-accent-ink"
                      : "border-border text-ink-soft hover:border-border-strong hover:bg-surface-2",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            size="sm"
            className="w-full"
            onClick={save}
            disabled={!canSave}
          >
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
