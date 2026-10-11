import { collectMissingEnv, failOnMissingEnv, normalizeBaseUrl } from "../../core/config.js";

export const DOCUMENSO_ROUTES = {
  signin: "/signin",
  csrf: "/api/auth/csrf",
  session: "/api/auth/session",
  emailPasswordAuthorize: "/api/auth/email-password/authorize",
  twoFactorSetup: "/api/auth/two-factor/setup",
  twoFactorEnable: "/api/auth/two-factor/enable",
  twoFactorDisable: "/api/auth/two-factor/disable",
  security: "/settings/security",
} as const;

export interface DocumensoTimeoutBudget {
  readonly request: number;
  readonly upDeadline: number;
  readonly healthPoll: number;
}

export const DOCUMENSO_TIMEOUTS: DocumensoTimeoutBudget = {
  request: 30_000,
  upDeadline: 600_000,
  healthPoll: 5_000,
};

export interface DocumensoE2EConfig {
  readonly baseUrl: string;
  readonly dbUrl: string;
}

const DEFAULT_DOCUMENSO_BASE_URL = "http://127.0.0.1:3001";

let cached: DocumensoE2EConfig | undefined;

function assertDocumensoBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new Error(`Invalid DOCUMENSO_BASE_URL: ${raw}`, { cause: error });
  }
  if (parsed.hostname === "localhost") {
    throw new Error(
      "DOCUMENSO_BASE_URL must use 127.0.0.1 (got localhost). localhost can hide an IPv6-only bind, so P1 does not accept it.",
    );
  }
  return normalizeBaseUrl(raw);
}

function assertDocumensoDbUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new Error(`Invalid DOCUMENSO_DB_URL: ${raw}`, { cause: error });
  }
  const protocol = parsed.protocol.replace(":", "");
  if (protocol !== "postgres" && protocol !== "postgresql") {
    throw new Error(`DOCUMENSO_DB_URL must be a postgres URL (got ${parsed.protocol}).`);
  }
  if (parsed.hostname !== "127.0.0.1") {
    throw new Error(`DOCUMENSO_DB_URL must use hostname 127.0.0.1 (got ${parsed.hostname}).`);
  }
  return raw.trim();
}

export function loadDocumensoConfig(): DocumensoE2EConfig {
  if (cached !== undefined) {
    return cached;
  }

  const baseUrlRaw = (process.env.DOCUMENSO_BASE_URL?.trim() ?? DEFAULT_DOCUMENSO_BASE_URL).trim();
  const dbUrlRaw = process.env.DOCUMENSO_DB_URL?.trim() ?? "";
  const missing = collectMissingEnv({
    DOCUMENSO_DB_URL: dbUrlRaw,
  });
  failOnMissingEnv(missing);

  const baseUrl = assertDocumensoBaseUrl(baseUrlRaw);
  const dbUrl = assertDocumensoDbUrl(dbUrlRaw);

  process.env.DOCUMENSO_BASE_URL ??= baseUrl;
  process.env.DOCUMENSO_DB_URL ??= dbUrl;

  cached = { baseUrl, dbUrl };
  return cached;
}

export function documensoTimeouts(): DocumensoTimeoutBudget {
  return DOCUMENSO_TIMEOUTS;
}
