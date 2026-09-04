import { defineConfig, devices } from "@playwright/test";

// E2E specs share one deployed local chain (see e2e/globalSetup.ts) and the app's
// single public/config.js, and they press with a shared clock the contract itself
// resets on every press — so tests run strictly serially, never in parallel.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/globalSetup.ts",
  globalTeardown: "./e2e/globalTeardown.ts",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 30_000
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
