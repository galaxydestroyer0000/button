/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    // `vite` alone never serves web/api/*.ts (that's a Vercel Functions
    // convention, not a Vite one) — `vercel dev` does, but its own reverse
    // proxy in front of Vite has proven flaky for HMR/module requests. Run
    // `vercel dev --listen 3100` alongside plain `vite`/`npm run dev` and this
    // forwards just the /api calls to it, so local development gets a real
    // Vite dev server AND real API routes hitting the real database.
    proxy: { "/api": "http://localhost:3100" }
  },
  preview: { port: 4173 },
  test: {
    environment: "node",
    setupFiles: ["./src/data/__tests__/setup.ts"],
    include: ["src/**/*.test.ts", "*.test.ts", "api/**/*.test.ts"]
  }
});
