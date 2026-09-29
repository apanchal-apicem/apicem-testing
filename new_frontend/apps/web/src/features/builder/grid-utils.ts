import type { ReportBlockLayout, ReportBlockType } from "@apicem/api-contract";

export const GRID_COLS = 12;
export const ROW_HEIGHT = 28;
export const GAP = 12;

export const defaultSizeByType: Record<ReportBlockType, { w: number; h: number }> = {
  kpi: { w: 3, h: 4 },
  chart: { w: 6, h: 9 },
  table: { w: 6, h: 9 },
  pivot: { w: 8, h: 10 },
  text: { w: 4, h: 5 },
  divider: { w: 12, h: 1 },
  image: { w: 4, h: 7 },
};

export const minSizeByType: Record<ReportBlockType, { w: number; h: number }> = {
  kpi: { w: 2, h: 3 },
  chart: { w: 3, h: 5 },
  table: { w: 3, h: 5 },
  pivot: { w: 4, h: 5 },
  text: { w: 2, h: 3 },
  divider: { w: 2, h: 1 },
  image: { w: 2, h: 4 },
};

export function layoutToPixels(layout: ReportBlockLayout, colWidth: number) {
  return {
    left: layout.x * (colWidth + GAP),
    top: layout.y * (ROW_HEIGHT + GAP),
    width: layout.w * colWidth + (layout.w - 1) * GAP,
    height: layout.h * ROW_HEIGHT + (layout.h - 1) * GAP,
  };
}

export function snapToGrid(pxLeft: number, pxTop: number, colWidth: number) {
  const x = Math.round(pxLeft / (colWidth + GAP));
  const y = Math.round(pxTop / (ROW_HEIGHT + GAP));
  return { x: Math.max(0, x), y: Math.max(0, y) };
}

export function pxToSize(pxWidth: number, pxHeight: number, colWidth: number) {
  const w = Math.round((pxWidth + GAP) / (colWidth + GAP));
  const h = Math.round((pxHeight + GAP) / (ROW_HEIGHT + GAP));
  return { w, h };
}

export function canvasHeight(blocks: { layout: ReportBlockLayout }[]) {
  const maxY = blocks.reduce((acc, b) => Math.max(acc, b.layout.y + b.layout.h), 0);
  return Math.max(400, maxY * (ROW_HEIGHT + GAP) + 160);
}
