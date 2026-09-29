import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ArrowLeft, Check, Eye, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Canvas } from "@/features/builder/canvas";
import { StaticCanvas } from "@/features/builder/static-canvas";
import { BlockPalette } from "@/features/builder/block-palette";
import { GRID_COLS, GAP, ROW_HEIGHT, defaultSizeByType, snapToGrid } from "@/features/builder/grid-utils";
import { useBuilderStore } from "@/stores/builder";
import { useReport, useRecordWorkbookViewOnce, useUpdateReport } from "@/api/hooks";
import type { ReportBlock, ReportBlockType } from "@apicem/api-contract";

const defaultConfigByType: Record<ReportBlockType, Record<string, unknown>> = {
  kpi: { metricId: "met_revenue", label: "Net Revenue", delta: 4.2 },
  chart: { source: "metric", key: "met_revenue", chartType: "line", title: "New chart" },
  table: { source: "preset", key: "top_products", title: "New table" },
  pivot: { metricIds: ["met_revenue"], rowDimensions: ["channel"], columnDimensions: [], title: "New pivot table" },
  text: { title: "Note", body: "Write something the numbers alone don't say." },
  divider: {},
  image: {},
};

export function ReportBuilderPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { data: report, isLoading } = useReport(reportId);
  const updateReport = useUpdateReport(reportId ?? "");
  // Opening the builder is also "viewing" the report, same reasoning as
  // ReportViewPage's identical call.
  useRecordWorkbookViewOnce(reportId);
  const { blocks, load, addBlock, dirty, markSaved } = useBuilderStore();

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [colWidth, setColWidth] = useState(80);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    if (report) load(report.id, report.blocks);
  }, [report, load]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setColWidth((width - GAP * (GRID_COLS - 1)) / GRID_COLS);
    });
    observer.observe(el);
    return () => observer.disconnect();
    // The ref swaps to a different DOM node when previewMode toggles
    // (Canvas vs. StaticCanvas's wrapper), so the observer needs to
    // re-attach rather than keep watching a node that's no longer mounted.
  }, [report, previewMode]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, delta } = event;
    const data = active.data.current as { kind: "existing" | "palette"; blockType?: ReportBlockType } | undefined;

    if (data?.kind === "palette" && data.blockType) {
      const rect = canvasRef.current?.getBoundingClientRect();
      const activator = event.activatorEvent as PointerEvent;
      const dropX = activator.clientX + delta.x - (rect?.left ?? 0);
      const dropY = activator.clientY + delta.y - (rect?.top ?? 0);
      const { x, y } = snapToGrid(dropX, dropY, colWidth);
      const size = defaultSizeByType[data.blockType];
      const block: ReportBlock = {
        id: `blk_${Math.random().toString(36).slice(2, 9)}`,
        type: data.blockType,
        layout: { x: Math.max(0, Math.min(GRID_COLS - size.w, x)), y: Math.max(0, y), ...size },
        config: defaultConfigByType[data.blockType],
      };
      addBlock(block);
      return;
    }

    const block = blocks.find((b) => b.id === active.id);
    if (!block) return;
    const pxLeft = block.layout.x * (colWidth + GAP) + delta.x;
    const pxTop = block.layout.y * (ROW_HEIGHT + GAP) + delta.y;
    const { x, y } = snapToGrid(pxLeft, pxTop, colWidth);
    useBuilderStore.getState().updateBlock(block.id, (b) => ({
      ...b,
      layout: { ...b.layout, x: Math.max(0, Math.min(GRID_COLS - b.layout.w, x)), y: Math.max(0, y) },
    }));
  }

  async function handleSave() {
    if (!reportId) return;
    await updateReport.mutateAsync({ blocks });
    markSaved();
  }

  if (isLoading || !report) {
    return (
      <output className="flex h-[70vh] items-center justify-center text-ink-faint">
        <Loader2 className="size-5 animate-spin" />
        <span className="sr-only">Loading report…</span>
      </output>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => navigate("/reports")}
            aria-label="Back to reports"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-2"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <p className="truncate font-display text-[14.5px] font-semibold text-ink">{report.name}</p>
            {/* <output>'s implicit status role (aria-live="polite") announces
                the save state change to a screen reader without needing
                focus to be on this text — otherwise a save happening while
                attention is elsewhere on the canvas would go unnoticed. */}
            <output className="block text-[11.5px] text-ink-faint">
              {dirty ? "Unsaved changes" : "All changes saved"}
            </output>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewMode((p) => !p)}>
            {previewMode ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
            <span className="hidden sm:inline">{previewMode ? "Edit" : "Preview"}</span>
          </Button>
          <Button size="sm" onClick={handleSave} loading={updateReport.isPending} disabled={!dirty}>
            <Check className="size-3.5" />
            <span className="hidden sm:inline">Save</span>
          </Button>
        </div>
      </header>

      <div className="scrollbar-thin flex-1 overflow-auto px-4 py-6 sm:px-8 sm:py-8">
        {previewMode ? (
          <div ref={canvasRef}>
            <StaticCanvas blocks={blocks} colWidth={colWidth} />
          </div>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <Canvas ref={canvasRef} blocks={blocks} colWidth={colWidth} />
            <BlockPalette onAdd={(type) => {
              const size = defaultSizeByType[type];
              const maxY = blocks.reduce((acc, b) => Math.max(acc, b.layout.y + b.layout.h), 0);
              addBlock({
                id: `blk_${Math.random().toString(36).slice(2, 9)}`,
                type,
                layout: { x: 0, y: maxY, ...size },
                config: defaultConfigByType[type],
              });
            }} />
          </DndContext>
        )}
      </div>
    </div>
  );
}
