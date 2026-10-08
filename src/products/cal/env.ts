import path from "node:path";
import {
  collectMissingEnv,
  failOnMissingEnv,
  normalizeOrigin,
  repoRoot,
} from "../../core/config.js";

export const CAL_WEB_MODES = ["prod", "dev"] as const;
export type CalWebMode = (typeof CAL_WEB_MODES)[number];

interface TimeoutBudget {
  readonly page: number;
  readonly editor: number;
  readonly test: number;
  readonly expect: number;
  readonly navigation: number;
  readonly action: number;
  readonly csrf: number;
  readonly warmup: number;
  readonly warmupEditor: number;
  readonly upDeadline: number;
  readonly healthPoll: number;
}

export const TIMEOUTS = {
  prod: {
    page: 15_000,
    editor: 30_000,
    test: 60_000,
    expect: 5_000,
    navigation: 30_000,
    action: 10_000,
    csrf: 15_000,
    warmup: 15_000,
    warmupEditor: 15_000,
    upDeadline: 60_000,
    healthPoll: 5_000,
  },
  dev: {
    page: 180_000,
    editor: 600_000,
    test: 180_000,
    expect: 20_000,
    navigation: 180_000,
    action: 60_000,
    csrf: 120_000,
    warmup: 180_000,
    warmupEditor: 600_000,
    upDeadline: 180_000,
    healthPoll: 5_000,
  },
} as const satisfies Record<CalWebMode, TimeoutBudget>;

export interface CalE2EConfig {
  readonly baseUrl: string;
  readonly email: string;
  readonly password: string;
  readonly webMode: CalWebMode;
  readonly productsRoot: string;
  readonly authStatePath: string;
}

const DEFAULT_PRODUCTS_ROOT = "../products";
const AUTH_STATE_RELATIVE = path.join(".auth", "cal-pro.json");

let cached: CalE2EConfig | undefined;

export function skipLiveCal(): boolean {
  if (process.env.CAL_E2E === "0") {
    return true;
  }
  if (process.env.CI && !process.env.CAL_E2E_BASE_URL) {
    return true;
  }
  return false;
}

export function parseWebMode(raw: string | undefined): CalWebMode {
  return (raw ?? "prod").trim().toLowerCase() === "dev" ? "dev" : "prod";
}

export function loadConfig(): CalE2EConfig {
  if (cached !== undefined) {
    return cached;
  }

  const email = process.env.CAL_E2E_EMAIL?.trim();
  const password = process.env.CAL_E2E_PASSWORD;
  const baseUrlRaw = (process.env.CAL_E2E_BASE_URL ?? process.env.CAL_BASE_URL)?.trim();
  const missing = collectMissingEnv({
    CAL_E2E_EMAIL: email,
    CAL_E2E_PASSWORD: password,
  });
  if (baseUrlRaw === undefined || baseUrlRaw === "") {
    missing.push("CAL_E2E_BASE_URL or CAL_BASE_URL");
  }
  failOnMissingEnv(missing);
  if (email === undefined || password === undefined || baseUrlRaw === undefined) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const productsRoot = process.env.PRODUCTS_ROOT?.trim() || DEFAULT_PRODUCTS_ROOT;
  process.env.PRODUCTS_ROOT = productsRoot;

  cached = {
    baseUrl: normalizeOrigin(baseUrlRaw),
    email,
    password,
    webMode: parseWebMode(process.env.CAL_WEB_MODE),
    productsRoot,
    authStatePath: path.join(repoRoot(), AUTH_STATE_RELATIVE),
  };
  return cached;
}

export function timeouts(): TimeoutBudget {
  return TIMEOUTS[loadConfig().webMode];
}
