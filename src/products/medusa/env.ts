import path from "node:path";
import {
  collectMissingEnv,
  failOnMissingEnv,
  normalizeBaseUrl,
  repoRoot,
} from "../../core/config.js";

const DEFAULT_MEDUSA_BASE_URL = "http://127.0.0.1:9000";
const DEFAULT_MEDUSA_DB_URL = "postgres://medusa:medusa@127.0.0.1:5433/medusa";
const DEFAULT_PRODUCTS_ROOT = "../products";
const AUTH_STATE_RELATIVE = path.join(".auth", "medusa-admin.json");

export const MEDUSA_ROUTES = {
  health: "/health",
  login: "/app/login",
  orders: "/app/orders",
  order: (id: string) => `/app/orders/${id}`,
  products: "/app/products",
  authEmailpass: "/auth/user/emailpass",
  authSession: "/auth/session",
  usersMe: "/admin/users/me",
} as const;

export interface MedusaTimeoutBudget {
  readonly request: number;
  readonly page: number;
  readonly test: number;
  readonly expect: number;
  readonly navigation: number;
  readonly action: number;
  readonly upDeadline: number;
  readonly healthPoll: number;
}

export const MEDUSA_TIMEOUTS: MedusaTimeoutBudget = {
  request: 30_000,
  page: 30_000,
  test: 120_000,
  expect: 15_000,
  navigation: 60_000,
  action: 30_000,
  upDeadline: 900_000,
  healthPoll: 5_000,
};

export interface MedusaE2EConfig {
  readonly baseUrl: string;
  readonly dbUrl: string;
  readonly adminEmail: string;
  readonly adminPassword: string;
  readonly productsRoot: string;
  readonly authStatePath: string;
}

let cached: MedusaE2EConfig | undefined;

/** Clears memoized config so the next `loadMedusaConfig()` re-reads `process.env`. */
export function resetMedusaConfigCache(): void {
  cached = undefined;
}

export function assertMedusaBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new Error(`Invalid MEDUSA_BASE_URL: ${raw}`, { cause: error });
  }
  if (parsed.hostname !== "127.0.0.1") {
    throw new Error(
      `MEDUSA_BASE_URL must use 127.0.0.1 (got ${parsed.hostname}). localhost can hide an IPv6-only bind, so P1 does not accept it.`,
    );
  }
  return normalizeBaseUrl(raw);
}

export function assertMedusaDbUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new Error(`Invalid MEDUSA_DB_URL: ${raw}`, { cause: error });
  }
  const protocol = parsed.protocol.replace(":", "");
  if (protocol !== "postgres" && protocol !== "postgresql") {
    throw new Error(`MEDUSA_DB_URL must be a postgres URL (got ${parsed.protocol}).`);
  }
  if (parsed.hostname !== "127.0.0.1") {
    throw new Error(`MEDUSA_DB_URL must use hostname 127.0.0.1 (got ${parsed.hostname}).`);
  }
  return raw.trim();
}

/** Admin credentials are required and have no default (plan D1). */
export function loadMedusaConfig(): MedusaE2EConfig {
  if (cached !== undefined) {
    return cached;
  }

  const adminEmail = process.env.MEDUSA_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.MEDUSA_ADMIN_PASSWORD?.trim();
  failOnMissingEnv(
    collectMissingEnv({
      MEDUSA_ADMIN_EMAIL: adminEmail,
      MEDUSA_ADMIN_PASSWORD: adminPassword,
    }),
  );

  const baseUrl = assertMedusaBaseUrl(
    process.env.MEDUSA_BASE_URL?.trim() || DEFAULT_MEDUSA_BASE_URL,
  );
  const dbUrl = assertMedusaDbUrl(process.env.MEDUSA_DB_URL?.trim() || DEFAULT_MEDUSA_DB_URL);
  const productsRoot = process.env.PRODUCTS_ROOT?.trim() || DEFAULT_PRODUCTS_ROOT;

  process.env.PRODUCTS_ROOT = productsRoot;
  process.env.MEDUSA_BASE_URL = baseUrl;
  process.env.MEDUSA_DB_URL = dbUrl;

  cached = {
    baseUrl,
    dbUrl,
    adminEmail: adminEmail ?? "",
    adminPassword: adminPassword ?? "",
    productsRoot,
    authStatePath: medusaAuthStatePath(),
  };
  return cached;
}

export function medusaBaseUrlFromEnv(): string {
  return process.env.MEDUSA_BASE_URL?.trim() || DEFAULT_MEDUSA_BASE_URL;
}

/** Needs no env, so config load and `--list` never require credentials. */
export function medusaAuthStatePath(): string {
  return path.join(repoRoot(), AUTH_STATE_RELATIVE);
}
