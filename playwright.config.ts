import { defineConfig, devices, type ReporterDescription } from "@playwright/test";
import { normalizeBaseUrl, parsePositiveInt } from "./src/core/config.js";
import { argvForProjectSelection, selectedProjects } from "./src/core/projects.js";
import {
  resolvePlaywrightBlobReportDir,
  resolvePlaywrightJsonReportFile,
  resolvePlaywrightJUnitReportFile,
} from "./src/core/playwright-json-summary.js";
import { loadConfig, parseWebMode, skipLiveCal, TIMEOUTS } from "./src/products/cal/env.js";
import {
  documensoPublicUrlFromEnv,
  documensoTreatInsecureOriginAsSecureLaunchArg,
} from "./src/products/documenso/env.js";

process.env.P1_SEED ??= String(Date.now());

const CAL_PROJECT_NAMES = ["cal-setup", "cal-chromium", "cal-firefox"] as const;
const DOCUMENSO_PROJECT_NAMES = [
  "documenso-rate-limit-chromium",
  "documenso-chromium",
  "documenso-firefox",
] as const;

const documensoChromeUse = {
  baseURL: documensoPublicUrlFromEnv(),
  channel: "chrome" as const,
  launchOptions: {
    args: [documensoTreatInsecureOriginAsSecureLaunchArg()],
  },
};

function documensoRetriesFromEnv(): number {
  const raw = process.env.P1_DOCUMENSO_RETRIES;
  if (raw === undefined || raw.trim() === "") {
    return 0;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`P1_DOCUMENSO_RETRIES must be a non-negative integer, got ${raw}`);
  }
  return parsed;
}

const documensoRetries = documensoRetriesFromEnv();

const projectSelectionArgv = argvForProjectSelection(process.argv);

function runsCalProject(): boolean {
  return selectedProjects(projectSelectionArgv, CAL_PROJECT_NAMES);
}

function runsDocumensoProject(): boolean {
  return selectedProjects(projectSelectionArgv, DOCUMENSO_PROJECT_NAMES);
}

const runsCal = runsCalProject();
const runsDocumenso = runsDocumensoProject();

/** Set by `npm run test:unit` so globalSetup does not start product harnesses. */
function shouldStartHarness(): boolean {
  if (process.env.P1_PLAYWRIGHT_HARNESS === "0") {
    return false;
  }
  if (process.env.npm_lifecycle_event === "test:unit") {
    return false;
  }
  return true;
}

const live = !skipLiveCal() && shouldStartHarness() && runsCal;
const webMode = live ? loadConfig().webMode : parseWebMode(process.env.CAL_WEB_MODE);
const rawBase = process.env.CAL_E2E_BASE_URL ?? process.env.CAL_BASE_URL;
const baseURL = live
  ? loadConfig().baseUrl
  : rawBase !== undefined && rawBase.trim() !== ""
    ? normalizeBaseUrl(rawBase)
    : undefined;

const harnessSetups: string[] = [];
if (shouldStartHarness()) {
  if (runsCal) {
    harnessSetups.push("./global-setup/index.ts");
  }
  if (runsDocumenso) {
    harnessSetups.push("./global-setup/documenso.ts");
  }
}

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
  ...(harnessSetups.length > 0 ? { globalSetup: harnessSetups } : {}),
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
      name: "documenso-rate-limit-chromium",
      testDir: "./tests/documenso/rate-limit",
      retries: 0,
      use: {
        ...devices["Desktop Chrome"],
        ...(runsDocumenso ? documensoChromeUse : {}),
      },
    },
    {
      name: "documenso-chromium",
      testDir: "./tests/documenso",
      testIgnore: /rate-limit\//,
      retries: documensoRetries,
      use: {
        ...devices["Desktop Chrome"],
        ...(runsDocumenso ? documensoChromeUse : {}),
      },
    },
    {
      name: "documenso-firefox",
      testDir: "./tests/documenso",
      grep: /P1-DOC-FW-001|P1-DOC-FW-002|P1-DOC-FW-003/,
      retries: documensoRetries,
      use: {
        ...devices["Desktop Firefox"],
        ...(runsDocumenso ? { baseURL: documensoPublicUrlFromEnv() } : {}),
      },
    },
  ],
});
