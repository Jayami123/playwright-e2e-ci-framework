import { defineConfig, devices, type ReporterDescription } from "@playwright/test";
import { normalizeBaseUrl, parsePositiveInt } from "./src/core/config.js";
import {
  resolvePlaywrightBlobReportDir,
  resolvePlaywrightJsonReportFile,
  resolvePlaywrightJUnitReportFile,
} from "./src/core/playwright-json-summary.js";
import { loadConfig, parseWebMode, skipLiveCal, TIMEOUTS } from "./src/products/cal/env.js";

process.env.P1_SEED ??= String(Date.now());

/** Set by `npm run test:unit` so globalSetup does not start the Cal harness. */
function shouldStartCalHarness(): boolean {
  if (process.env.P1_PLAYWRIGHT_HARNESS === "0") {
    return false;
  }
  if (process.env.npm_lifecycle_event === "test:unit") {
    return false;
  }
  return true;
}

const live = !skipLiveCal() && shouldStartCalHarness();
const webMode = live ? loadConfig().webMode : parseWebMode(process.env.CAL_WEB_MODE);
const rawBase = process.env.CAL_E2E_BASE_URL ?? process.env.CAL_BASE_URL;
const baseURL = live
  ? loadConfig().baseUrl
  : rawBase !== undefined && rawBase.trim() !== ""
    ? normalizeBaseUrl(rawBase)
    : undefined;

const jsonReportFile = resolvePlaywrightJsonReportFile();
const junitReportFile = resolvePlaywrightJUnitReportFile();
const blobReportDir = resolvePlaywrightBlobReportDir();

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // Default 1: CAL_WEB_MODE=dev webpack serializes compiles; extra workers time out CSRF.
  workers: parsePositiveInt(process.env.PW_WORKERS, 1),
  reporter: process.env.CI
    ? ([
        ["blob", { outputDir: blobReportDir }],
        ["github"],
        ["list"],
        ["junit", { outputFile: junitReportFile }],
        ["json", { outputFile: jsonReportFile }],
      ] satisfies ReporterDescription[])
    : [["html", { open: "never" }], ["list"]],
  timeout: TIMEOUTS[webMode].test,
  expect: { timeout: TIMEOUTS[webMode].expect },
  ...(live ? { globalSetup: "./global-setup/index.ts" } : {}),
  use: {
    ...(baseURL === undefined ? {} : { baseURL }),
    navigationTimeout: TIMEOUTS[webMode].navigation,
    actionTimeout: TIMEOUTS[webMode].action,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "cal-setup",
      testDir: "./tests/setup",
      testMatch: /cal\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], trace: "off" },
    },
    {
      name: "unit",
      testDir: "./tests/unit",
      testMatch: /.*\.spec\.ts/,
    },
    {
      name: "cal-chromium",
      dependencies: ["cal-setup"],
      testDir: "./tests/cal",
      use: {
        ...devices["Desktop Chrome"],
        ...(live ? { storageState: loadConfig().proAuthStatePath } : {}),
      },
    },
    {
      name: "cal-firefox",
      dependencies: ["cal-setup"],
      testDir: "./tests/cal",
      grep: /@tz|@2fa/,
      use: {
        ...devices["Desktop Firefox"],
        ...(live ? { storageState: loadConfig().proAuthStatePath } : {}),
      },
    },
    {
      name: "cal-webkit",
      dependencies: ["cal-setup"],
      testDir: "./tests/cal",
      grep: /@tz|@2fa/,
      use: {
        ...devices["Desktop Safari"],
        ...(live ? { storageState: loadConfig().proAuthStatePath } : {}),
      },
    },
  ],
});
