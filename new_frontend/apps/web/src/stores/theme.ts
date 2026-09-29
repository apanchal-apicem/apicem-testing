import { create } from "zustand";

export type ThemePreference = "light" | "dark";

interface ThemeState {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
}

const STORAGE_KEY = "apicem.theme";

function applyTheme(pref: ThemePreference) {
  document.documentElement.setAttribute("data-theme", pref);
}

function readInitialPreference(): ThemePreference {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  // No stored choice yet — start from the OS-level preference once, rather
  // than defaulting to light, but from here on this is just a plain
  // light/dark switch with no ongoing "system" mode to track.
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const initial = readInitialPreference();
if (typeof document !== "undefined") applyTheme(initial);

export const useThemeStore = create<ThemeState>((set) => ({
  preference: initial,
  setPreference: (pref) => {
    applyTheme(pref);
    window.localStorage.setItem(STORAGE_KEY, pref);
    set({ preference: pref });
  },
}));
