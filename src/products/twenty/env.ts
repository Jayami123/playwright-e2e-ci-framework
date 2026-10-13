import path from "node:path";
import { normalizeBaseUrl, repoRoot } from "../../core/config.js";

/** Matches qa-portfolio-harness `TWENTY_DEV_SEED_PASSWORD` (fork dev seeder). */
export const TWENTY_HARNESS_DEFAULT_PASSWORD = "tim@apple.dev";

/** Matches qa-portfolio-harness `TWENTY_DEFAULT_ADMIN_EMAIL`. */
export const TWENTY_HARNESS_DEFAULT_EMAIL = "jane.austen@apple.dev";

const DEFAULT_TWENTY_BASE_URL = "http://127.0.0.1:3002";
const DEFAULT_TWENTY_DB_URL = "postgres://postgres:postgres@127.0.0.1:5434/default";
const DEFAULT_PRODUCTS_ROOT = "../products";
const AUTH_STATE_RELATIVE = path.join(".auth", "twenty-jane.json");

export const TWENTY_ROUTES = {
  welcome: "/welcome",
  healthz: "/healthz",
  companiesHome: "/objects/companies",
} as const;

export interface TwentyTimeoutBudget {
  readonly request: number;
  readonly page: number;
  readonly test: number;
  readonly expect: number;
  readonly navigation: number;
  readonly action: number;
  readonly upDeadline: number;
  readonly healthPoll: number;
}

export const TWENTY_TIMEOUTS: TwentyTimeoutBudget = {
  request: 30_000,
  page: 30_000,
  test: 120_000,
  expect: 15_000,
  navigation: 60_000,
  action: 30_000,
  upDeadline: 600_000,
  healthPoll: 5_000,
};

export interface TwentyE2EConfig {
  readonly baseUrl: string;
  readonly email: string;
  readonly password: string;
  readonly productsRoot: string;
  readonly authStatePath: string;
  readonly dbUrl: string;
}

let cached: TwentyE2EConfig | undefined;

/** Clears memoized config so the next `loadTwentyConfig()` re-reads `process.env`. */
export function resetTwentyConfigCache(): void {
  cached = undefined;
}

function assertTwentyBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new Error(`Invalid TWENTY_BASE_URL: ${raw}`, { cause: error });
  }
  if (parsed.hostname !== "127.0.0.1") {
    throw new Error(
      `TWENTY_BASE_URL must use 127.0.0.1 (got ${parsed.hostname}). localhost can hide an IPv6-only bind, so P1 does not accept it.`,
    );
  }
  return normalizeBaseUrl(raw);
}

function assertTwentyDbUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new Error(`Invalid TWENTY_DB_URL: ${raw}`, { cause: error });
  }
  const protocol = parsed.protocol.replace(":", "");
  if (protocol !== "postgres" && protocol !== "postgresql") {
    throw new Error(`TWENTY_DB_URL must be a postgres URL (got ${parsed.protocol}).`);
  }
  if (parsed.hostname !== "127.0.0.1") {
    throw new Error(`TWENTY_DB_URL must use hostname 127.0.0.1 (got ${parsed.hostname}).`);
  }
  return raw.trim();
}

export function loadTwentyConfig(): TwentyE2EConfig {
  if (cached !== undefined) {
    return cached;
  }

  const baseUrlRaw = process.env.TWENTY_BASE_URL?.trim() || DEFAULT_TWENTY_BASE_URL;
  const email = process.env.TWENTY_EMAIL?.trim() || TWENTY_HARNESS_DEFAULT_EMAIL;
  const password = process.env.TWENTY_PASSWORD?.trim() || TWENTY_HARNESS_DEFAULT_PASSWORD;
  const dbUrlRaw = process.env.TWENTY_DB_URL?.trim() || DEFAULT_TWENTY_DB_URL;
  const productsRoot = process.env.PRODUCTS_ROOT?.trim() || DEFAULT_PRODUCTS_ROOT;

  const baseUrl = assertTwentyBaseUrl(baseUrlRaw);
  const dbUrl = assertTwentyDbUrl(dbUrlRaw);

  process.env.PRODUCTS_ROOT = productsRoot;
  process.env.TWENTY_BASE_URL = baseUrl;
  process.env.TWENTY_EMAIL = email;
  process.env.TWENTY_PASSWORD = password;
  process.env.TWENTY_DB_URL = dbUrl;

  cached = {
    baseUrl,
    email,
    password,
    productsRoot,
    authStatePath: path.join(repoRoot(), AUTH_STATE_RELATIVE),
    dbUrl,
  };
  return cached;
}

export function twentyTimeouts(): TwentyTimeoutBudget {
  return TWENTY_TIMEOUTS;
}

export function twentyBaseUrlFromEnv(): string {
  return process.env.TWENTY_BASE_URL?.trim() || DEFAULT_TWENTY_BASE_URL;
}
