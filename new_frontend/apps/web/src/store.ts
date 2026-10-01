import {
  configureStore,
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import {
  useDispatch,
  useSelector,
  type TypedUseSelectorHook,
} from "react-redux";
import type { ReportBlock } from "@apicem/api-contract";
import { apiClient, getStoredToken, isMockMode } from "@/api/client";
import { clearQueryCache } from "@/api/query-client";

type AuthStatus = "checking" | "loading" | "authenticated" | "unauthenticated";

interface AuthThunkState {
  auth: { status: AuthStatus };
}

function readAuthState() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem("apicem.authenticated") !== "0";
}

export const initializeAuth = createAsyncThunk<
  boolean,
  void,
  { state: AuthThunkState }
>(
  "auth/initialize",
  async () => {
    if (isMockMode) return readAuthState();
    const token = getStoredToken();
    if (!token) return false;
    try {
      await apiClient.getCurrentUser();
      return true;
    } catch {
      return false;
    }
  },
  { condition: (_, { getState }) => getState().auth.status === "checking" },
);

export const signIn = createAsyncThunk<
  void,
  { email: string; password: string }
>("auth/signIn", async ({ email, password }) => {
  await apiClient.signIn(email, password);
  if (isMockMode) window.localStorage.setItem("apicem.authenticated", "1");
});

export const signUp = createAsyncThunk<
  void,
  { companyName: string; email: string; password: string }
>("auth/signUp", async ({ companyName, email, password }) => {
  await apiClient.signUp(companyName, email, password);
  if (isMockMode) window.localStorage.setItem("apicem.authenticated", "1");
});

export const signOut = createAsyncThunk("auth/signOut", async () => {
  try {
    await apiClient.signOut();
  } finally {
    clearQueryCache();
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("apicem_access_token");
        window.localStorage.removeItem("apicem.authenticated");
        window.localStorage.removeItem("apicem.queryCache");
        window.sessionStorage.clear();
      } catch {}
    }
  }
});

function readSidebarState() {
  return (
    typeof window !== "undefined" &&
    window.localStorage.getItem("apicem.sidebarCollapsed") === "1"
  );
}

function readThemePreference(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("apicem.theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

const authSlice = createSlice({
  name: "auth",
  initialState: {
    status: (isMockMode
      ? readAuthState()
        ? "authenticated"
        : "unauthenticated"
      : "checking") as AuthStatus,
  },
  reducers: {
    setStatus(state, action: PayloadAction<AuthStatus>) {
      state.status = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeAuth.pending, (state) => {
        state.status = "loading";
      })
      .addCase(initializeAuth.fulfilled, (state, action) => {
        state.status = action.payload ? "authenticated" : "unauthenticated";
      })
      .addCase(initializeAuth.rejected, (state) => {
        state.status = "unauthenticated";
      })
      .addCase(signIn.pending, (state) => {
        state.status = "loading";
      })
      .addCase(signIn.fulfilled, (state) => {
        state.status = "authenticated";
      })
      .addCase(signIn.rejected, (state) => {
        state.status = "unauthenticated";
      })
      .addCase(signUp.pending, (state) => {
        state.status = "loading";
      })
      .addCase(signUp.fulfilled, (state) => {
        state.status = "authenticated";
      })
      .addCase(signUp.rejected, (state) => {
        state.status = "unauthenticated";
      })
      .addCase(signOut.fulfilled, (state) => {
        state.status = "unauthenticated";
      })
      .addCase(signOut.rejected, (state) => {
        state.status = "unauthenticated";
      });
  },
});

interface BuilderState {
  reportId: string | null;
  blocks: ReportBlock[];
  selectedId: string | null;
  dirty: boolean;
}

const builderSlice = createSlice({
  name: "builder",
  initialState: {
    reportId: null,
    blocks: [],
    selectedId: null,
    dirty: false,
  } as BuilderState,
  reducers: {
    loadBuilder(
      state,
      action: PayloadAction<{ reportId: string; blocks: ReportBlock[] }>,
    ) {
      state.reportId = action.payload.reportId;
      state.blocks = action.payload.blocks;
      state.selectedId = null;
      state.dirty = false;
    },
    addBlock(state, action: PayloadAction<ReportBlock>) {
      state.blocks.push(action.payload);
      state.selectedId = action.payload.id;
      state.dirty = true;
    },
    updateBlock(
      state,
      action: PayloadAction<{ id: string; patch: Partial<ReportBlock> }>,
    ) {
      const block = state.blocks.find((item) => item.id === action.payload.id);
      if (block) Object.assign(block, action.payload.patch);
      state.dirty = true;
    },
    removeBlock(state, action: PayloadAction<string>) {
      state.blocks = state.blocks.filter(
        (block) => block.id !== action.payload,
      );
      if (state.selectedId === action.payload) state.selectedId = null;
      state.dirty = true;
    },
    selectBlock(state, action: PayloadAction<string | null>) {
      state.selectedId = action.payload;
    },
    bringToFront(state, action: PayloadAction<string>) {
      const index = state.blocks.findIndex(
        (block) => block.id === action.payload,
      );
      if (index < 0 || index === state.blocks.length - 1) return;
      const [block] = state.blocks.splice(index, 1);
      state.blocks.push(block);
    },
    markBuilderSaved(state) {
      state.dirty = false;
    },
  },
});

const sidebarSlice = createSlice({
  name: "sidebar",
  initialState: { collapsed: readSidebarState() },
  reducers: {
    setSidebarCollapsed(state, action: PayloadAction<boolean>) {
      state.collapsed = action.payload;
    },
  },
});

const themeSlice = createSlice({
  name: "theme",
  initialState: { preference: readThemePreference() as "light" | "dark" },
  reducers: {
    setThemePreference(state, action: PayloadAction<"light" | "dark">) {
      state.preference = action.payload;
    },
  },
});

export const authActions = authSlice.actions;
export const builderActions = builderSlice.actions;
export const sidebarActions = sidebarSlice.actions;
export const themeActions = themeSlice.actions;

export function createAppStore() {
  return configureStore({
    reducer: {
      auth: authSlice.reducer,
      builder: builderSlice.reducer,
      sidebar: sidebarSlice.reducer,
      theme: themeSlice.reducer,
    },
  });
}

export const store = createAppStore();

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
