import { defineConfig, devices } from "@playwright/test";
import { AUTH_STATE_PATH, calBaseUrl, skipLiveCal } from "./src/env.js";

const live = !skipLiveCal();

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["blob"], ["list"]] : [["html"], ["list"]],
  timeout: 180_000,
  expect: { timeout: 20_000 },
  globalSetup: live ? "./global-setup/index.ts" : undefined,
  use: {
    baseURL: process.env.CAL_E2E_BASE_URL || calBaseUrl(),
    navigationTimeout: 180_000,
    actionTimeout: 20_000,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "cal-setup",
      testDir: "./src/auth",
      testMatch: /cal\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "cal-chromium",
      dependencies: ["cal-setup"],
      testDir: "./tests/cal",
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH_STATE_PATH,
      },
    },
    // Phase 2: enable after browser-matrix nightly is in scope.
    // { name: "cal-webkit", use: { ...devices["Desktop Safari"], storageState: AUTH_STATE_PATH } },
    // { name: "cal-firefox", use: { ...devices["Desktop Firefox"], storageState: AUTH_STATE_PATH } },
    // Phase 3: visual projects (3 viewports) — do not enable yet.
  ],
});
