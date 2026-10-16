import { defineConfig, devices, type Project, type ReporterDescription } from "@playwright/test";
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
import {
  medusaAuthStatePath,
  medusaBaseUrlFromEnv,
  MEDUSA_TIMEOUTS,
} from "./src/products/medusa/env.js";
import {
  loadTwentyConfig,
  twentyBaseUrlFromEnv,
  twentyTimeouts,
} from "./src/products/twenty/env.js";

process.env.P1_SEED ??= String(Date.now());

const CAL_PROJECT_NAMES = ["cal-setup", "cal-chromium", "cal-firefox"] as const;
const DOCUMENSO_PROJECT_NAMES = [
  "documenso-rate-limit-chromium",
  "documenso-chromium",
  "documenso-firefox",
] as const;
const TWENTY_PROJECT_NAMES = ["twenty-setup", "twenty-chromium"] as const;
const MEDUSA_PROJECT_NAMES = ["medusa-setup", "medusa-chromium"] as const;
const VISUAL_PROJECT_NAMES = ["visual-mobile", "visual-tablet", "visual-desktop"] as const;
type VisualProjectName = (typeof VISUAL_PROJECT_NAMES)[number];
const VISUAL_VIEWPORTS: Readonly<Record<VisualProjectName, { width: number; height: number }>> = {
  "visual-mobile": { width: 393, height: 852 },
  "visual-tablet": { width: 820, height: 1180 },
  "visual-desktop": { width: 1440, height: 900 },
};
/** ADR 0017: visual, a11y and i18n specs run only in visual-* projects. */
const VISUAL_A11Y_MATCH = [
  "**/visual/**/*.spec.ts",
  "**/a11y/**/*.spec.ts",
  "**/i18n/**/*.spec.ts",
];
const VISUAL_A11Y_IGNORE = ["**/visual/**", "**/a11y/**", "**/i18n/**"];

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

function runsTwentyProject(): boolean {
  return selectedProjects(projectSelectionArgv, TWENTY_PROJECT_NAMES);
}

function runsMedusaProject(): boolean {
  return selectedProjects(projectSelectionArgv, MEDUSA_PROJECT_NAMES);
}

function runsVisualProject(): boolean {
  return selectedProjects(projectSelectionArgv, VISUAL_PROJECT_NAMES);
}

const runsCal = runsCalProject();
const runsDocumenso = runsDocumensoProject();
const runsTwenty = runsTwentyProject();
const runsMedusa = runsMedusaProject();
const runsVisual = runsVisualProject();

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
  if (runsCal || runsVisual) {
    harnessSetups.push("./global-setup/index.ts");
  }
  if (runsDocumenso) {
    harnessSetups.push("./global-setup/documenso.ts");
  }
  if (runsTwenty) {
    harnessSetups.push("./global-setup/twenty.ts");
  }
  if (runsMedusa) {
    harnessSetups.push("./global-setup/medusa.ts");
  }
}

const harnessTeardowns: string[] = [];
if (shouldStartHarness()) {
  if (runsTwenty) {
    harnessTeardowns.push("./global-teardown/twenty.ts");
  }
  if (runsMedusa) {
    harnessTeardowns.push("./global-teardown/medusa.ts");
  }
}

const medusaChromeUse = { baseURL: medusaBaseUrlFromEnv() };

const twentyChromeUse = {
  baseURL: runsTwenty ? loadTwentyConfig().baseUrl : twentyBaseUrlFromEnv(),
};

const jsonReportFile = resolvePlaywrightJsonReportFile();
const junitReportFile = resolvePlaywrightJUnitReportFile();
const blobReportDir = resolvePlaywrightBlobReportDir();

function visualProject(name: VisualProjectName): Project {
  return {
    name,
    testDir: "./tests",
    testMatch: VISUAL_A11Y_MATCH,
    retries: 0,
    snapshotPathTemplate: "{testDir}/{testFileDir}/__screenshots__/{projectName}/{arg}{ext}",
    // Project expect replaces top-level expect, so repeat the timeout.
    expect: {
      timeout: TIMEOUTS[webMode].expect,
      toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" },
    },
    use: {
      ...devices["Desktop Chrome"],
      viewport: VISUAL_VIEWPORTS[name],
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      locale: "en-US",
      timezoneId: "Europe/London",
      colorScheme: "light",
    },
  };
}

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
  ...(harnessTeardowns.length > 0 ? { globalTeardown: harnessTeardowns } : {}),
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
      testIgnore: VISUAL_A11Y_IGNORE,
      use: {
        ...devices["Desktop Chrome"],
        ...(live ? { storageState: loadConfig().proAuthStatePath } : {}),
      },
    },
    {
      name: "cal-firefox",
      dependencies: ["cal-setup"],
      testDir: "./tests/cal",
      testIgnore: VISUAL_A11Y_IGNORE,
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
      testIgnore: [/rate-limit\//, ...VISUAL_A11Y_IGNORE],
      retries: documensoRetries,
      use: {
        ...devices["Desktop Chrome"],
        ...(runsDocumenso ? documensoChromeUse : {}),
      },
    },
    {
      name: "documenso-firefox",
      testDir: "./tests/documenso",
      testIgnore: VISUAL_A11Y_IGNORE,
      grep: /P1-DOC-FW-001|P1-DOC-FW-002|P1-DOC-FW-003/,
      retries: documensoRetries,
      use: {
        ...devices["Desktop Firefox"],
        ...(runsDocumenso ? { baseURL: documensoPublicUrlFromEnv() } : {}),
      },
    },
    {
      name: "twenty-setup",
      testDir: "./tests/setup",
      testMatch: /twenty\.setup\.ts/,
      retries: 0,
      timeout: twentyTimeouts().test,
      expect: { timeout: twentyTimeouts().expect },
      use: {
        ...devices["Desktop Chrome"],
        actionTimeout: twentyTimeouts().action,
        navigationTimeout: twentyTimeouts().navigation,
        ...(runsTwenty ? twentyChromeUse : {}),
        trace: "off",
      },
    },
    {
      name: "twenty-chromium",
      dependencies: ["twenty-setup"],
      testDir: "./tests/twenty",
      testIgnore: VISUAL_A11Y_IGNORE,
      retries: 0,
      timeout: twentyTimeouts().test,
      expect: { timeout: twentyTimeouts().expect },
      use: {
        ...devices["Desktop Chrome"],
        actionTimeout: twentyTimeouts().action,
        navigationTimeout: twentyTimeouts().navigation,
        ...(runsTwenty
          ? {
              ...twentyChromeUse,
              storageState: loadTwentyConfig().authStatePath,
            }
          : {}),
      },
    },
    {
      name: "medusa-setup",
      testDir: "./tests/setup",
      testMatch: /medusa.setup.ts/,
      retries: 0,
      timeout: MEDUSA_TIMEOUTS.test,
      expect: { timeout: MEDUSA_TIMEOUTS.expect },
      use: {
        ...devices["Desktop Chrome"],
        actionTimeout: MEDUSA_TIMEOUTS.action,
        navigationTimeout: MEDUSA_TIMEOUTS.navigation,
        ...medusaChromeUse,
        trace: "off",
      },
    },
    {
      name: "medusa-chromium",
      dependencies: ["medusa-setup"],
      testDir: "./tests/medusa",
      testIgnore: VISUAL_A11Y_IGNORE,
      retries: 0,
      timeout: MEDUSA_TIMEOUTS.test,
      expect: { timeout: MEDUSA_TIMEOUTS.expect },
      use: {
        ...devices["Desktop Chrome"],
        actionTimeout: MEDUSA_TIMEOUTS.action,
        navigationTimeout: MEDUSA_TIMEOUTS.navigation,
        ...medusaChromeUse,
        storageState: medusaAuthStatePath(),
      },
    },
    ...VISUAL_PROJECT_NAMES.map(visualProject),
  ],
});
