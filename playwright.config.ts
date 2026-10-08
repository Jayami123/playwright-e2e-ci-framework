import { defineConfig, devices } from "@playwright/test";
import {
  AUTH_STATE_PATH,
  calActionTimeoutMs,
  calBaseUrl,
  calExpectTimeoutMs,
  calNavigationTimeoutMs,
  calTestTimeoutMs,
  skipLiveCal,
} from "./src/env.js";

const live = !skipLiveCal();

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CAL_WEB_MODE=dev webpack serializes compiles; 4 workers time out CSRF and leave blank pages.
  workers: 1,
  reporter: process.env.CI ? [["blob"], ["list"]] : [["html"], ["list"]],
  timeout: calTestTimeoutMs(),
  expect: { timeout: calExpectTimeoutMs() },
  globalSetup: live ? "./global-setup/index.ts" : undefined,
  use: {
    baseURL: process.env.CAL_E2E_BASE_URL || calBaseUrl(),
    navigationTimeout: calNavigationTimeoutMs(),
    actionTimeout: calActionTimeoutMs(),
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
    // Phase 3: visual projects (3 viewports) -- do not enable yet.
  ],
});
