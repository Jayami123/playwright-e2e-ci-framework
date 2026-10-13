import { expect, test } from "@playwright/test";
import {
  loadTwentyConfig,
  resetTwentyConfigCache,
  TWENTY_HARNESS_DEFAULT_EMAIL,
  twentyBaseUrlFromEnv,
} from "../../src/products/twenty/env.js";

const DEFAULT_TWENTY_BASE_URL = "http://127.0.0.1:3002";
const DEFAULT_TWENTY_DB_URL = "postgres://postgres:postgres@127.0.0.1:5434/default";

const TWENTY_ENV_KEYS = [
  "TWENTY_BASE_URL",
  "TWENTY_EMAIL",
  "TWENTY_DB_URL",
  "TWENTY_PASSWORD",
] as const;

function snapshotTwentyEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of TWENTY_ENV_KEYS) {
    out[key] = process.env[key];
  }
  return out;
}

function restoreTwentyEnv(snapshot: Record<string, string | undefined>): void {
  for (const key of TWENTY_ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) {
      if (key === "TWENTY_BASE_URL") {
        delete process.env.TWENTY_BASE_URL;
      } else if (key === "TWENTY_EMAIL") {
        delete process.env.TWENTY_EMAIL;
      } else if (key === "TWENTY_DB_URL") {
        delete process.env.TWENTY_DB_URL;
      } else {
        delete process.env.TWENTY_PASSWORD;
      }
    } else {
      process.env[key] = value;
    }
  }
  resetTwentyConfigCache();
}

test.describe("Twenty env blank fallbacks", { tag: ["@unit"] }, () => {
  let priorEnv: Record<string, string | undefined>;

  test.beforeEach(() => {
    priorEnv = snapshotTwentyEnv();
    resetTwentyConfigCache();
  });

  test.afterEach(() => {
    restoreTwentyEnv(priorEnv);
  });

  test("blank TWENTY_BASE_URL uses harness default", () => {
    process.env.TWENTY_BASE_URL = "";
    expect(loadTwentyConfig().baseUrl).toBe(DEFAULT_TWENTY_BASE_URL);
  });

  test("whitespace-only TWENTY_BASE_URL uses harness default", () => {
    process.env.TWENTY_BASE_URL = "   ";
    expect(loadTwentyConfig().baseUrl).toBe(DEFAULT_TWENTY_BASE_URL);
  });

  test("blank TWENTY_EMAIL uses harness default", () => {
    process.env.TWENTY_EMAIL = "";
    expect(loadTwentyConfig().email).toBe(TWENTY_HARNESS_DEFAULT_EMAIL);
  });

  test("whitespace-only TWENTY_EMAIL uses harness default", () => {
    process.env.TWENTY_EMAIL = "  \t  ";
    expect(loadTwentyConfig().email).toBe(TWENTY_HARNESS_DEFAULT_EMAIL);
  });

  test("blank TWENTY_DB_URL uses harness default", () => {
    process.env.TWENTY_DB_URL = "";
    expect(loadTwentyConfig().dbUrl).toBe(DEFAULT_TWENTY_DB_URL);
  });

  test("whitespace-only TWENTY_DB_URL uses harness default", () => {
    process.env.TWENTY_DB_URL = " \n ";
    expect(loadTwentyConfig().dbUrl).toBe(DEFAULT_TWENTY_DB_URL);
  });
});

test.describe("twentyBaseUrlFromEnv blank fallbacks", { tag: ["@unit"] }, () => {
  let priorBaseUrl: string | undefined;

  test.beforeEach(() => {
    priorBaseUrl = process.env.TWENTY_BASE_URL;
  });

  test.afterEach(() => {
    if (priorBaseUrl === undefined) {
      delete process.env.TWENTY_BASE_URL;
    } else {
      process.env.TWENTY_BASE_URL = priorBaseUrl;
    }
  });

  test("blank TWENTY_BASE_URL uses harness default", () => {
    process.env.TWENTY_BASE_URL = "";
    expect(twentyBaseUrlFromEnv()).toBe(DEFAULT_TWENTY_BASE_URL);
  });

  test("whitespace-only TWENTY_BASE_URL uses harness default", () => {
    process.env.TWENTY_BASE_URL = "   ";
    expect(twentyBaseUrlFromEnv()).toBe(DEFAULT_TWENTY_BASE_URL);
  });
});
