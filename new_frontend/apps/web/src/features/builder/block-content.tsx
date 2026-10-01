import { useState } from "react";
import { ImageIcon, ImageOff } from "lucide-react";
import type { ChartType, ReportBlock } from "@apicem/api-contract";
import { useBlockData, useMetrics, usePivotBlockData } from "@/api/hooks";
import { KpiTile } from "@/components/charts/kpi-tile";
import { ChartRenderer } from "@/components/charts/chart-renderer";
import { QueryDataTable } from "@/components/charts/query-data-table";
import { PivotTableView } from "@/features/explorer/pivot-table-view";
import { builderActions, useAppDispatch } from "@/store";
import { resolveKey } from "./resolve-key";

function KpiBlock({ config }: { config: Record<string, unknown> }) {
  const ref = resolveKey(config);
  const { data: metrics = [] } = useMetrics();
  const { data: result, isLoading } = useBlockData(ref?.source, ref?.key);
  const metric = metrics.find((m) => m.id === ref?.key);

  if (isLoading || !result)
    return (
      <div className="size-full animate-pulse rounded-(--radius-md) bg-surface-2" />
    );

  const yCol = result.columns[1];
  const last = result.rows[result.rows.length - 1];
  const value =
    typeof last?.[yCol?.key] === "number" ? (last[yCol.key] as number) : 0;
  const series = result.rows.map((r) =>
    typeof r[yCol?.key] === "number" ? (r[yCol.key] as number) : 0,
  );

  return (
    <KpiTile
      label={
        (config.label as string) ?? metric?.name ?? yCol?.label ?? "Metric"
      }
      value={value}
      format={
        metric?.format ?? (yCol?.type === "currency" ? "currency" : "number")
      }
      delta={config.delta as number | undefined}
      series={series}
      className="h-full border-0 p-0"
    />
  );
}

function ChartBlock({ config }: { config: Record<string, unknown> }) {
  const ref = resolveKey(config);
  const { data: result, isLoading } = useBlockData(ref?.source, ref?.key);

  if (isLoading || !result)
    return (
      <div className="size-full animate-pulse rounded-(--radius-md) bg-surface-2" />
    );

  return (
    <div className="flex h-full flex-col">
      {config.title ? (
        <p className="mb-2 text-[13px] font-semibold text-ink">
          {String(config.title)}
        </p>
      ) : null}
      <div className="min-h-0 flex-1">
        <ChartRenderer
          result={result}
          chartType={config.chartType as ChartType | undefined}
          height="100%"
        />
      </div>
    </div>
  );
}

function TableBlock({ config }: { config: Record<string, unknown> }) {
  const ref = resolveKey(config);
  const { data: result, isLoading } = useBlockData(ref?.source, ref?.key);

  if (isLoading || !result)
    return (
      <div className="size-full animate-pulse rounded-(--radius-md) bg-surface-2" />
    );

  return (
    <div className="flex h-full flex-col">
      {config.title ? (
        <p className="mb-2 text-[13px] font-semibold text-ink">
          {String(config.title)}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <QueryDataTable rows={result.rows} columns={result.columns} dense />
      </div>
    </div>
  );
}

function PivotBlock({ config }: { config: Record<string, unknown> }) {
  const metricIds = (config.metricIds as string[] | undefined) ?? [];
  const rowDimensions = (config.rowDimensions as string[] | undefined) ?? [];
  const columnDimensions =
    (config.columnDimensions as string[] | undefined) ?? [];
  const { data: result, isLoading } = usePivotBlockData(
    metricIds,
    rowDimensions,
    columnDimensions,
  );

  if (isLoading || !result)
    return (
      <div className="size-full animate-pulse rounded-(--radius-md) bg-surface-2" />
    );

  return (
    <div className="flex h-full flex-col">
      {config.title ? (
        <p className="mb-2 text-[13px] font-semibold text-ink">
          {String(config.title)}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <PivotTableView result={result} />
      </div>
    </div>
  );
}

function TextBlock({
  block,
  readOnly,
}: {
  block: ReportBlock;
  readOnly?: boolean;
}) {
  const dispatch = useAppDispatch();
  const config = block.config as { title?: string; body?: string };

  if (readOnly) {
    return (
      <div className="flex h-full flex-col gap-1.5 overflow-auto">
        {config.title && (
          <p className="font-display text-[14px] font-semibold text-ink">
            {config.title}
          </p>
        )}
        {config.body && (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">
            {config.body}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-1.5">
      <input
        value={config.title ?? ""}
        onChange={(e) =>
          dispatch(
            builderActions.updateBlock({
              id: block.id,
              patch: { config: { ...block.config, title: e.target.value } },
            }),
          )
        }
        placeholder="Section title"
        className="bg-transparent font-display text-[14px] font-semibold text-ink outline-none placeholder:text-ink-faint"
      />
      <textarea
        value={config.body ?? ""}
        onChange={(e) =>
          dispatch(
            builderActions.updateBlock({
              id: block.id,
              patch: { config: { ...block.config, body: e.target.value } },
            }),
          )
        }
        placeholder="Write a note…"
        className="min-h-0 flex-1 resize-none bg-transparent text-[13px] leading-relaxed text-ink-soft outline-none placeholder:text-ink-faint"
      />
    </div>
  );
}

function ImageBlock({
  block,
  readOnly,
}: {
  block: ReportBlock;
  readOnly?: boolean;
}) {
  const dispatch = useAppDispatch();
  const config = block.config as { url?: string };
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(config.url) && !broken;

  // No caption field exists to describe this image, so it's marked
  // decorative (empty alt) rather than guessing at meaningful text.
  if (readOnly) {
    if (showImage) {
      return (
        <img
          src={config.url}
          alt=""
          onError={() => setBroken(true)}
          className="size-full rounded-(--radius-md) object-cover"
        />
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-(--radius-md) border border-dashed border-border-strong bg-surface-2/60 text-ink-faint">
        {broken ? (
          <ImageOff className="size-5" />
        ) : (
          <ImageIcon className="size-5" />
        )}
        <span className="text-[12px]">
          {broken ? "Image failed to load" : "No image"}
        </span>
      </div>
    );
  }

  // The URL input stays mounted here regardless of whether a preview above
  // it is showing — swapping it out for a bare <img> the moment a URL looks
  // non-empty (as an earlier version did) remounts a fresh input on every
  // keystroke's error/success, dropping focus and truncating what was typed
  // to whatever one character had landed before the remount.
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-(--radius-md) border border-dashed border-border-strong bg-surface-2/60">
      <div className="flex min-h-0 flex-1 items-center justify-center text-ink-faint">
        {showImage ? (
          <img
            src={config.url}
            alt=""
            onError={() => setBroken(true)}
            className="size-full object-cover"
          />
        ) : broken ? (
          <ImageOff className="size-5" />
        ) : (
          <ImageIcon className="size-5" />
        )}
      </div>
      <div className="shrink-0 space-y-1 p-2.5">
        <input
          value={config.url ?? ""}
          onChange={(e) => {
            setBroken(false);
            dispatch(
              builderActions.updateBlock({
                id: block.id,
                patch: { config: { ...block.config, url: e.target.value } },
              }),
            );
          }}
          placeholder="Paste an image URL…"
          aria-label="Image URL"
          className="w-full rounded-(--radius-sm) border border-border-strong bg-surface px-2.5 py-1.5 text-center text-[12px] text-ink outline-none placeholder:text-ink-faint focus:border-accent"
        />
        {broken && (
          <p className="text-center text-[11px] text-danger">
            Couldn't load that image
          </p>
        )}
      </div>
    </div>
  );
}

export function BlockContent({
  block,
  readOnly,
}: {
  block: ReportBlock;
  readOnly?: boolean;
}) {
  switch (block.type) {
    case "kpi":
      return <KpiBlock config={block.config} />;
    case "chart":
      return <ChartBlock config={block.config} />;
    case "table":
      return <TableBlock config={block.config} />;
    case "pivot":
      return <PivotBlock config={block.config} />;
    case "text":
      return <TextBlock block={block} readOnly={readOnly} />;
    case "divider":
      return (
        <div className="flex h-full items-center">
          <div className="h-px w-full bg-border-strong" />
        </div>
      );
    case "image":
      return <ImageBlock block={block} readOnly={readOnly} />;
    default:
      return null;
  }
}
