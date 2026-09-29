import { create } from "zustand";

/**
 * Whether the demo session is signed in — gates every route under
 * `AppShell` (see app-shell.tsx). Defaults to signed in on a browser that's
 * never touched this key at all, so a first-ever visit still walks straight
 * into the demo the way it always has; only an explicit sign-out (or a
 * previous session's sign-out) sends a later visit back to `/login`.
 * Persisted the same way as `useSidebarStore`/`useThemeStore` — a plain
 * localStorage flag, not real session/token auth, since there's no backend
 * behind this to hold a real session.
 */
interface AuthState {
  isAuthenticated: boolean;
  signIn: () => void;
  signOut: () => void;
}

const STORAGE_KEY = "apicem.authenticated";

function readInitial(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(STORAGE_KEY) !== "0";
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: readInitial(),
  signIn: () => {
    window.localStorage.setItem(STORAGE_KEY, "1");
    set({ isAuthenticated: true });
  },
  signOut: () => {
    window.localStorage.setItem(STORAGE_KEY, "0");
    set({ isAuthenticated: false });
  },
}));
