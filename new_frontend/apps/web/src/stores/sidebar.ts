import { create } from "zustand";

/**
 * Desktop-only: whether the sidebar rail shows icon-only or icon+label.
 * The mobile drawer never reads this — it's an on-demand overlay already,
 * not a persistent rail competing for width, so collapsing it wouldn't
 * solve anything a close button doesn't already.
 */
interface SidebarState {
  collapsed: boolean;
  toggleCollapsed: () => void;
}

const STORAGE_KEY = "apicem.sidebarCollapsed";

function readInitial(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  collapsed: readInitial(),
  toggleCollapsed: () => {
    const next = !get().collapsed;
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    set({ collapsed: next });
  },
}));
