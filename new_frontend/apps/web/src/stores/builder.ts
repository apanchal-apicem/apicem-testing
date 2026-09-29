import { create } from "zustand";
import type { ReportBlock } from "@apicem/api-contract";

interface BuilderState {
  reportId: string | null;
  blocks: ReportBlock[];
  selectedId: string | null;
  dirty: boolean;
  load: (reportId: string, blocks: ReportBlock[]) => void;
  addBlock: (block: ReportBlock) => void;
  updateBlock: (id: string, patch: Partial<ReportBlock> | ((b: ReportBlock) => ReportBlock)) => void;
  removeBlock: (id: string) => void;
  selectBlock: (id: string | null) => void;
  bringToFront: (id: string) => void;
  markSaved: () => void;
}

export const useBuilderStore = create<BuilderState>((set) => ({
  reportId: null,
  blocks: [],
  selectedId: null,
  dirty: false,
  load: (reportId, blocks) => set({ reportId, blocks, selectedId: null, dirty: false }),
  addBlock: (block) => set((s) => ({ blocks: [...s.blocks, block], selectedId: block.id, dirty: true })),
  updateBlock: (id, patch) =>
    set((s) => ({
      blocks: s.blocks.map((b) => (b.id === id ? (typeof patch === "function" ? patch(b) : { ...b, ...patch }) : b)),
      dirty: true,
    })),
  removeBlock: (id) =>
    set((s) => ({
      blocks: s.blocks.filter((b) => b.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      dirty: true,
    })),
  selectBlock: (id) => set({ selectedId: id }),
  bringToFront: (id) =>
    set((s) => {
      const target = s.blocks.find((b) => b.id === id);
      if (!target) return s;
      return { blocks: [...s.blocks.filter((b) => b.id !== id), target] };
    }),
  markSaved: () => set({ dirty: false }),
}));
