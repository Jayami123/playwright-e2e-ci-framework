import { defineConfig, devices } from "@playwright/test";
import { parsePositiveInt } from "./src/core/config.js";
import { loadConfig, parseWebMode, skipLiveCal, TIMEOUTS } from "./src/products/cal/env.js";

process.env.P1_SEED ??= String(Date.now());

const live = !skipLiveCal();
const webMode = live ? loadConfig().webMode : parseWebMode(process.env.CAL_WEB_MODE);
const baseURL = live
  ? loadConfig().baseUrl
  : (process.env.CAL_E2E_BASE_URL ?? process.env.CAL_BASE_URL)?.replace(/\/$/, "");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // Default 1: CAL_WEB_MODE=dev webpack serializes compiles; extra workers time out CSRF.
  workers: parsePositiveInt(process.env.PW_WORKERS, 1),
  reporter: process.env.CI
    ? [["blob"], ["github"], ["list"]]
    : [["html", { open: "never" }], ["list"]],
  timeout: TIMEOUTS[webMode].test,
  expect: { timeout: TIMEOUTS[webMode].expect },
  ...(live ? { globalSetup: "./global-setup/index.ts" } : {}),
  use: {
    ...(baseURL === undefined ? {} : { baseURL }),
    navigationTimeout: TIMEOUTS[webMode].navigation,
    actionTimeout: TIMEOUTS[webMode].action,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "cal-setup",
      testDir: "./tests/setup",
      testMatch: /cal\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "cal-chromium",
      dependencies: ["cal-setup"],
      testDir: "./tests/cal",
      use: {
        ...devices["Desktop Chrome"],
        ...(live ? { storageState: loadConfig().authStatePath } : {}),
      },
    },
  ],
});
