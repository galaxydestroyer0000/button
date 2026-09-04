/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 4173 },
  preview: { port: 4173 },
  test: {
    environment: "node",
    setupFiles: ["./src/data/__tests__/setup.ts"],
    include: ["src/**/*.test.ts", "*.test.ts"]
  }
});
