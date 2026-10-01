import { beforeEach, describe, expect, it } from "vitest";
import type { ReportBlock } from "@apicem/api-contract";
import { builderActions, store } from "@/store";

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
describe("builder slice", () => {
  beforeEach(() => {
    store.dispatch(
      builderActions.loadBuilder({ reportId: "rpt_test", blocks: [] }),
    );
  });

  it("load replaces the blocks, clears selection, and starts clean (not dirty)", () => {
    store.dispatch(builderActions.selectBlock("some-id"));
    store.dispatch(
      builderActions.loadBuilder({ reportId: "rpt_1", blocks: [block("a")] }),
    );
    const state = store.getState().builder;
    expect(state.reportId).toBe("rpt_1");
    expect(state.blocks).toEqual([block("a")]);
    expect(state.selectedId).toBeNull();
    expect(state.dirty).toBe(false);
  });

  it("addBlock appends the block, selects it, and marks the report dirty", () => {
    store.dispatch(builderActions.addBlock(block("a")));
    const state = store.getState().builder;
    expect(state.blocks.map((b) => b.id)).toEqual(["a"]);
    expect(state.selectedId).toBe("a");
    expect(state.dirty).toBe(true);
  });

  it("updateBlock applies a partial patch object to only the matching block", () => {
    store.dispatch(
      builderActions.loadBuilder({
        reportId: "rpt_test",
        blocks: [block("a"), block("b")],
      }),
    );
    store.dispatch(
      builderActions.updateBlock({
        id: "a",
        patch: { layout: { x: 5, y: 5, w: 3, h: 4 } },
      }),
    );
    const [firstBlock, secondBlock] = store.getState().builder.blocks;
    expect(firstBlock.layout.x).toBe(5);
    expect(secondBlock.layout.x).toBe(0);
  });

  it("updateBlock applies an updater function, same as block-frame's resize handler does", () => {
    store.dispatch(
      builderActions.loadBuilder({
        reportId: "rpt_test",
        blocks: [block("a")],
      }),
    );
    store.dispatch(
      builderActions.updateBlock({
        id: "a",
        patch: { layout: { ...block("a").layout, w: 4 } },
      }),
    );
    expect(store.getState().builder.blocks[0].layout.w).toBe(4);
  });

  it("removeBlock removes the block and clears selection only if it was the selected one", () => {
    store.dispatch(
      builderActions.loadBuilder({
        reportId: "rpt_test",
        blocks: [block("a"), block("b")],
      }),
    );
    store.dispatch(builderActions.selectBlock("a"));
    store.dispatch(builderActions.removeBlock("a"));
    expect(store.getState().builder.blocks.map((item) => item.id)).toEqual([
      "b",
    ]);
    expect(store.getState().builder.selectedId).toBeNull();

    store.dispatch(
      builderActions.loadBuilder({
        reportId: "rpt_test",
        blocks: [block("a"), block("b")],
      }),
    );
    store.dispatch(builderActions.selectBlock("b"));
    store.dispatch(builderActions.removeBlock("a"));
    expect(store.getState().builder.selectedId).toBe("b");
  });

  it("bringToFront moves the block to the end without duplicating or dropping any other block", () => {
    store.dispatch(
      builderActions.loadBuilder({
        reportId: "rpt_test",
        blocks: [block("a"), block("b"), block("c")],
      }),
    );
    store.dispatch(builderActions.bringToFront("a"));
    expect(store.getState().builder.blocks.map((item) => item.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("bringToFront is a no-op for an id that doesn't exist, rather than dropping every block", () => {
    store.dispatch(
      builderActions.loadBuilder({
        reportId: "rpt_test",
        blocks: [block("a"), block("b")],
      }),
    );
    store.dispatch(builderActions.bringToFront("does-not-exist"));
    expect(store.getState().builder.blocks.map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("markSaved clears the dirty flag without touching blocks or selection", () => {
    store.dispatch(builderActions.addBlock(block("a")));
    store.dispatch(builderActions.selectBlock("a"));
    store.dispatch(builderActions.markBuilderSaved());
    const state = store.getState().builder;
    expect(state.dirty).toBe(false);
    expect(state.selectedId).toBe("a");
    expect(state.blocks).toHaveLength(1);
  });
});
