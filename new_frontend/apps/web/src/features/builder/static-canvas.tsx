import type { ReportBlock } from "@apicem/api-contract";
import { BlockContent } from "./block-content";
import { canvasHeight, layoutToPixels } from "./grid-utils";

/**
 * The non-editing twin of `Canvas` — same grid math and block rendering, none
 * of the drag/resize/select machinery. Used wherever a report is only being
 * looked at: the report view page, and the builder's own Preview toggle.
 */
export function StaticCanvas({ blocks, colWidth }: { blocks: ReportBlock[]; colWidth: number }) {
  return (
    <div className="relative w-full" style={{ height: canvasHeight(blocks) }}>
      {blocks.map((block) => {
        const pixels = layoutToPixels(block.layout, colWidth);
        return (
          <div
            key={block.id}
            style={{ position: "absolute", left: pixels.left, top: pixels.top, width: pixels.width, height: pixels.height }}
            className="overflow-hidden rounded-(--radius-md) border border-border bg-surface p-3.5"
          >
            <BlockContent block={block} readOnly />
          </div>
        );
      })}
    </div>
  );
}
