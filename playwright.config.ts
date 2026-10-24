import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5174";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    // The Organization spotlight tour auto-starts on a first visit; specs start as a returning user so its overlay never
    // sits over the page under test. tour.spec.ts clears this to test the first visit.
    storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin, localStorage: [{ name: "fire3d-org-tour", value: "done" }] }] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : { command: "node node_modules/next/dist/bin/next start --port 5174", url: "http://localhost:5174", reuseExistingServer: false, timeout: 30_000 },
});
