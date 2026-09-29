import { useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import type { ReportBlock } from "@apicem/api-contract";
import { useBuilderStore } from "@/stores/builder";
import { GRID_COLS, layoutToPixels, minSizeByType, pxToSize } from "./grid-utils";
import { BlockContent } from "./block-content";
import { EditBlockPopover } from "./edit-block-popover";
import { EditPivotBlockPopover } from "./edit-pivot-block-popover";
import { cn } from "@/lib/utils";

const editableBlockTypes = new Set<ReportBlock["type"]>(["kpi", "chart", "table"]);

export function BlockFrame({ block, colWidth }: { block: ReportBlock; colWidth: number }) {
  const selectedId = useBuilderStore((s) => s.selectedId);
  const selectBlock = useBuilderStore((s) => s.selectBlock);
  const bringToFront = useBuilderStore((s) => s.bringToFront);
  const updateBlock = useBuilderStore((s) => s.updateBlock);
  const removeBlock = useBuilderStore((s) => s.removeBlock);
  const resizeStart = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: block.id,
    data: { kind: "existing" },
  });

  const pixels = layoutToPixels(block.layout, colWidth);
  const selected = selectedId === block.id;

  function handleResizePointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeStart.current = { x: e.clientX, y: e.clientY, w: pixels.width, h: pixels.height };

    function onMove(ev: PointerEvent) {
      if (!resizeStart.current) return;
      const dx = ev.clientX - resizeStart.current.x;
      const dy = ev.clientY - resizeStart.current.y;
      const { w, h } = pxToSize(resizeStart.current.w + dx, resizeStart.current.h + dy, colWidth);
      const min = minSizeByType[block.type];
      updateBlock(block.id, (b) => ({
        ...b,
        layout: { ...b.layout, w: Math.max(min.w, Math.min(12 - b.layout.x, w)), h: Math.max(min.h, h) },
      }));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      resizeStart.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  /**
   * Dragging to move/resize has no keyboard equivalent, so the block frame
   * itself is a real, focusable, arrow-key-operable control — Tab reaches
   * it (selecting it, same as a click), arrows nudge it one grid unit,
   * Delete/Backspace removes it. Guarded to only fire when the frame itself
   * is the event target, not a descendant: the text block's own input and
   * textarea need Backspace/arrows to behave like a normal text field, not
   * delete or move the whole block out from under whoever's typing.
   */
  function handleFrameKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const min = minSizeByType[block.type];

    if (e.shiftKey) {
      // Shift+arrow resizes, mirroring the drag-resize handle in the corner.
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          updateBlock(block.id, (b) => ({ ...b, layout: { ...b.layout, w: Math.max(min.w, b.layout.w - 1) } }));
          return;
        case "ArrowRight":
          e.preventDefault();
          updateBlock(block.id, (b) => ({ ...b, layout: { ...b.layout, w: Math.min(GRID_COLS - b.layout.x, b.layout.w + 1) } }));
          return;
        case "ArrowUp":
          e.preventDefault();
          updateBlock(block.id, (b) => ({ ...b, layout: { ...b.layout, h: Math.max(min.h, b.layout.h - 1) } }));
          return;
        case "ArrowDown":
          e.preventDefault();
          updateBlock(block.id, (b) => ({ ...b, layout: { ...b.layout, h: b.layout.h + 1 } }));
          return;
      }
    }

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        updateBlock(block.id, (b) => ({ ...b, layout: { ...b.layout, x: Math.max(0, b.layout.x - 1) } }));
        break;
      case "ArrowRight":
        e.preventDefault();
        updateBlock(block.id, (b) => ({ ...b, layout: { ...b.layout, x: Math.min(GRID_COLS - b.layout.w, b.layout.x + 1) } }));
        break;
      case "ArrowUp":
        e.preventDefault();
        updateBlock(block.id, (b) => ({ ...b, layout: { ...b.layout, y: Math.max(0, b.layout.y - 1) } }));
        break;
      case "ArrowDown":
        e.preventDefault();
        updateBlock(block.id, (b) => ({ ...b, layout: { ...b.layout, y: b.layout.y + 1 } }));
        break;
      case "Delete":
      case "Backspace":
        e.preventDefault();
        removeBlock(block.id);
        break;
    }
  }

  return (
    // A native <button> isn't an option here despite the interactivity below:
    // this frame contains its own interactive children (the remove button,
    // the resize handle, and, for a text block, a real input/textarea), and
    // a button can't legally contain other focusable controls. A
    // custom-widget div with a role, tabIndex, and its own key handling is
    // the correct pattern for a complex draggable/resizable canvas object,
    // not an oversight the linter's generic "prefer an interactive element"
    // rules are built to catch.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={setNodeRef}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
      role="group"
      aria-label={`${block.type} block${selected ? ", selected. Arrow keys move, shift plus arrow keys resize, Delete removes" : ""}`}
      onPointerDown={() => {
        selectBlock(block.id);
        bringToFront(block.id);
      }}
      onFocus={() => {
        selectBlock(block.id);
        bringToFront(block.id);
      }}
      onKeyDown={handleFrameKeyDown}
      style={{
        position: "absolute",
        left: pixels.left,
        top: pixels.top,
        width: pixels.width,
        height: pixels.height,
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        zIndex: selected ? 20 : 1,
      }}
      className={cn(
        "group rounded-(--radius-md) border bg-surface transition-shadow",
        selected ? "border-accent shadow-lg" : "border-border hover:border-border-strong",
        isDragging && "opacity-70",
      )}
    >
      <div
        {...listeners}
        {...attributes}
        className={cn(
          "absolute -top-3 left-2 z-10 flex cursor-grab items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[10.5px] font-medium text-ink-faint opacity-0 transition-opacity active:cursor-grabbing",
          (selected || isDragging) && "opacity-100",
          "group-hover:opacity-100",
        )}
      >
        <GripVertical className="size-3" />
        {block.type}
      </div>

      {selected && editableBlockTypes.has(block.type) && <EditBlockPopover block={block} />}
      {selected && block.type === "pivot" && <EditPivotBlockPopover block={block} />}

      {selected && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeBlock(block.id);
          }}
          aria-label={`Remove ${block.type} block`}
          className="absolute -top-3 right-2 z-10 flex size-5 items-center justify-center rounded-full border border-border bg-surface text-danger transition-colors hover:bg-danger hover:text-primary-ink"
        >
          <Trash2 className="size-3" />
        </button>
      )}

      <div className="size-full overflow-hidden p-3.5">
        <BlockContent block={block} />
      </div>

      {selected && (
        <div
          onPointerDown={handleResizePointerDown}
          className="absolute bottom-0.5 right-0.5 size-3.5 cursor-nwse-resize rounded-sm border-b-2 border-r-2 border-accent"
        />
      )}
    </div>
  );
}
