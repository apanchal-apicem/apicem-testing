import { forwardRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { ReportBlock } from "@apicem/api-contract";
import { BlockFrame } from "./block-frame";
import { canvasHeight } from "./grid-utils";
import { useBuilderStore } from "@/stores/builder";

export const Canvas = forwardRef<HTMLDivElement, { blocks: ReportBlock[]; colWidth: number }>(
  ({ blocks, colWidth }, ref) => {
    const { setNodeRef } = useDroppable({ id: "canvas" });
    const selectBlock = useBuilderStore((s) => s.selectBlock);

    return (
      <div
        ref={(node) => {
          setNodeRef(node);
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) selectBlock(null);
        }}
        className="relative w-full rounded-(--radius-lg) border border-dashed border-border bg-[image:radial-gradient(var(--border)_1px,transparent_1px)] bg-[length:24px_24px]"
        style={{ height: canvasHeight(blocks) }}
      >
        {blocks.map((block) => (
          <BlockFrame key={block.id} block={block} colWidth={colWidth} />
        ))}
        {blocks.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-[13px] text-ink-faint">
            Drag a block from the toolbar below to start building
          </p>
        )}
      </div>
    );
  },
);
Canvas.displayName = "Canvas";
