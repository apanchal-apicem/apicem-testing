/// <reference types="vitest/config" />
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Listens on every network interface, not just localhost, so a phone
    // on the same Wi-Fi can reach it at http://<this machine's LAN IP>:5173
    // — useful for exactly the kind of real-device responsive check a
    // resized browser window can't substitute for.
    host: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // The mock adapter's real, deliberate per-call latency (see
    // adapter.ts's LATENCY comment) plus several sequential awaited calls
    // in one test can, under the CPU contention of the full suite running
    // in parallel, occasionally push a test past Vitest's 5s default —
    // confirmed by the same test passing every time in isolation. A wider
    // margin here is the fix, not a smaller one: shortening the suite's
    // real work to chase a tighter timeout would be optimizing the test
    // environment at the expense of what the mock is honestly modeling.
    testTimeout: 15_000,
  },
})
