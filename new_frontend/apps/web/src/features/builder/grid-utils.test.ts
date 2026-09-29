import { describe, expect, it } from "vitest";
import type { ReportBlockType } from "@apicem/api-contract";
import {
  GAP,
  ROW_HEIGHT,
  canvasHeight,
  defaultSizeByType,
  layoutToPixels,
  minSizeByType,
  pxToSize,
  snapToGrid,
} from "./grid-utils";

const colWidth = 80;

describe("layoutToPixels / snapToGrid round-trip", () => {
  it("converts a grid layout to pixels and back to the same grid position", () => {
    const layout = { x: 3, y: 2, w: 4, h: 5 };
    const pixels = layoutToPixels(layout, colWidth);
    const snapped = snapToGrid(pixels.left, pixels.top, colWidth);
    expect(snapped).toEqual({ x: 3, y: 2 });
  });

  it("accounts for the gap between columns/rows, not just raw column width", () => {
    const layout = { x: 1, y: 0, w: 1, h: 1 };
    const pixels = layoutToPixels(layout, colWidth);
    expect(pixels.left).toBe(1 * (colWidth + GAP));
    expect(pixels.top).toBe(0);
  });

  it("never snaps to a negative grid position, even from a pixel position above/left of the canvas", () => {
    expect(snapToGrid(-500, -500, colWidth)).toEqual({ x: 0, y: 0 });
  });
});

describe("pxToSize", () => {
  it("converts pixel dimensions to a whole number of grid columns/rows", () => {
    const layout = { x: 0, y: 0, w: 4, h: 3 };
    const pixels = layoutToPixels(layout, colWidth);
    expect(pxToSize(pixels.width, pixels.height, colWidth)).toEqual({ w: 4, h: 3 });
  });
});

describe("canvasHeight", () => {
  it("has a floor even for an empty or very short report", () => {
    expect(canvasHeight([])).toBe(400);
    expect(canvasHeight([{ layout: { x: 0, y: 0, w: 3, h: 1 } }])).toBe(400);
  });

  it("grows to fit the lowest block's bottom edge, not just the tallest single block", () => {
    const blocks = [
      { layout: { x: 0, y: 0, w: 3, h: 4 } },
      { layout: { x: 3, y: 20, w: 3, h: 4 } }, // starts lower, so its bottom edge is what matters
    ];
    const expectedMaxY = 20 + 4;
    expect(canvasHeight(blocks)).toBe(expectedMaxY * (ROW_HEIGHT + GAP) + 160);
  });
});

describe("default and minimum block sizes stay consistent", () => {
  it("never gives a block type a default size smaller than its own minimum size", () => {
    for (const type of Object.keys(defaultSizeByType) as ReportBlockType[]) {
      expect(defaultSizeByType[type].w).toBeGreaterThanOrEqual(minSizeByType[type].w);
      expect(defaultSizeByType[type].h).toBeGreaterThanOrEqual(minSizeByType[type].h);
    }
  });
});
