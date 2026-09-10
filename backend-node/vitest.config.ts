import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    // Sequential, not parallel -- tests share one real Postgres and the in-memory rate
    // limiter's module-level state, same reason backend/tests/conftest.py's autouse
    // _reset_rate_limits fixture exists on the Python side.
    fileParallelism: false,
  },
});
