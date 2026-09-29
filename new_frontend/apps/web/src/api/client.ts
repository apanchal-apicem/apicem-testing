import { mockClient } from "./mock/adapter";
import { realClient } from "./real/adapter";
import type { ApiClient } from "./types";

/**
 * The one switch that moves the whole app off fixture data and onto the
 * real backend. Defaults to mock so the app runs standalone with no backend
 * running. Set VITE_USE_MOCK=false (and VITE_API_BASE_URL) in .env.local
 * once the backend is up.
 */
const useMock = import.meta.env.VITE_USE_MOCK !== "false";

export const apiClient: ApiClient = useMock ? mockClient : realClient;
export const isMockMode = useMock;
