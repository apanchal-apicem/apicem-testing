import { beforeEach, describe, expect, it } from "vitest";
import type { ReportBlock } from "@apicem/api-contract";
import { useBuilderStore } from "./builder";

function block(id: string, overrides: Partial<ReportBlock> = {}): ReportBlock {
  return {
    id,
    type: "kpi",
    layout: { x: 0, y: 0, w: 3, h: 4 },
    config: { metricId: "met_revenue", label: "Net Revenue" },
    ...overrides,
  };
}

/**
 * This store is the actual state a drag, resize, or palette-drop mutates —
 * `canvas.tsx`/`block-frame.tsx` wire dnd-kit's pointer events to it, but
 * the state transitions themselves (what "add," "move," "remove," "bring
 * to front" mean) don't need a simulated drag to verify.
 */
describe("useBuilderStore", () => {
  beforeEach(() => {
    useBuilderStore.setState({ reportId: null, blocks: [], selectedId: null, dirty: false });
  });

  it("load replaces the blocks, clears selection, and starts clean (not dirty)", () => {
    useBuilderStore.getState().selectBlock("some-id");
    useBuilderStore.getState().load("rpt_1", [block("a")]);
    const state = useBuilderStore.getState();
    expect(state.reportId).toBe("rpt_1");
    expect(state.blocks).toEqual([block("a")]);
    expect(state.selectedId).toBeNull();
    expect(state.dirty).toBe(false);
  });

  it("addBlock appends the block, selects it, and marks the report dirty", () => {
    useBuilderStore.getState().addBlock(block("a"));
    const state = useBuilderStore.getState();
    expect(state.blocks.map((b) => b.id)).toEqual(["a"]);
    expect(state.selectedId).toBe("a");
    expect(state.dirty).toBe(true);
  });

  it("updateBlock applies a partial patch object to only the matching block", () => {
    useBuilderStore.setState({ blocks: [block("a"), block("b")] });
    useBuilderStore.getState().updateBlock("a", { layout: { x: 5, y: 5, w: 3, h: 4 } });
    const [a, b] = useBuilderStore.getState().blocks;
    expect(a.layout.x).toBe(5);
    expect(b.layout.x).toBe(0);
  });

  it("updateBlock applies an updater function, same as block-frame's resize handler does", () => {
    useBuilderStore.setState({ blocks: [block("a", { layout: { x: 0, y: 0, w: 3, h: 4 } })] });
    useBuilderStore.getState().updateBlock("a", (b) => ({ ...b, layout: { ...b.layout, w: b.layout.w + 1 } }));
    expect(useBuilderStore.getState().blocks[0].layout.w).toBe(4);
  });

  it("removeBlock removes the block and clears selection only if it was the selected one", () => {
    useBuilderStore.setState({ blocks: [block("a"), block("b")], selectedId: "a" });
    useBuilderStore.getState().removeBlock("a");
    expect(useBuilderStore.getState().blocks.map((b) => b.id)).toEqual(["b"]);
    expect(useBuilderStore.getState().selectedId).toBeNull();

    useBuilderStore.setState({ blocks: [block("a"), block("b")], selectedId: "b" });
    useBuilderStore.getState().removeBlock("a");
    expect(useBuilderStore.getState().selectedId).toBe("b");
  });

  it("bringToFront moves the block to the end without duplicating or dropping any other block", () => {
    useBuilderStore.setState({ blocks: [block("a"), block("b"), block("c")] });
    useBuilderStore.getState().bringToFront("a");
    expect(useBuilderStore.getState().blocks.map((b) => b.id)).toEqual(["b", "c", "a"]);
  });

  it("bringToFront is a no-op for an id that doesn't exist, rather than dropping every block", () => {
    useBuilderStore.setState({ blocks: [block("a"), block("b")] });
    useBuilderStore.getState().bringToFront("does-not-exist");
    expect(useBuilderStore.getState().blocks.map((b) => b.id)).toEqual(["a", "b"]);
  });

  it("markSaved clears the dirty flag without touching blocks or selection", () => {
    useBuilderStore.setState({ blocks: [block("a")], selectedId: "a", dirty: true });
    useBuilderStore.getState().markSaved();
    const state = useBuilderStore.getState();
    expect(state.dirty).toBe(false);
    expect(state.selectedId).toBe("a");
    expect(state.blocks).toHaveLength(1);
  });
});
