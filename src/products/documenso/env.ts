import net from "node:net";
import { collectMissingEnv, failOnMissingEnv, normalizeBaseUrl } from "../../core/config.js";

export const DOCUMENSO_ROUTES = {
  signin: "/signin",
  csrf: "/api/auth/csrf",
  session: "/api/auth/session",
  emailPasswordAuthorize: "/api/auth/email-password/authorize",
  passkeyAuthorize: "/api/auth/passkey/authorize",
  twoFactorSetup: "/api/auth/two-factor/setup",
  twoFactorEnable: "/api/auth/two-factor/enable",
  twoFactorDisable: "/api/auth/two-factor/disable",
  security: "/settings/security",
  securityPasskeys: "/settings/security/passkeys",
} as const;

export function documensoTeamDocumentsPath(teamUrl: string): string {
  return `/t/${teamUrl}/documents`;
}

export function documensoSignPath(token: string): string {
  return `/sign/${token}`;
}

export interface DocumensoTimeoutBudget {
  readonly request: number;
  readonly upDeadline: number;
  readonly healthPoll: number;
  readonly journey: number;
}

export const DOCUMENSO_TIMEOUTS: DocumensoTimeoutBudget = {
  request: 30_000,
  upDeadline: 600_000,
  healthPoll: 5_000,
  journey: 120_000,
};

export interface DocumensoE2EConfig {
  readonly baseUrl: string;
  readonly dbUrl: string;
  readonly inbucketOrigin: string;
}

const DEFAULT_DOCUMENSO_LISTEN_URL = "http://127.0.0.1:3001";
const DEFAULT_DOCUMENSO_PUBLIC_URL = "http://p1.lvh.me:3001";
const DEFAULT_INBUCKET_ORIGIN = "http://127.0.0.1:9003";

let cached: DocumensoE2EConfig | undefined;

function assertDocumensoListenUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (error) {
    throw new Error(`Invalid DOCUMENSO_BASE_URL: ${raw}`, { cause: error });
  }
  if (parsed.hostname !== "127.0.0.1") {
    throw new Error(
      `DOCUMENSO_BASE_URL must use 127.0.0.1 (got ${parsed.hostname}). localhost can hide an IPv6-only bind, so P1 does not accept it.`,
    );
  }
  return normalizeBaseUrl(raw);
}

function listenPort(listenUrl: string): string {
  const parsed = new URL(listenUrl);
  return parsed.port || "3001";
}

function assertDocumensoPublicUrl(raw: string, listenUrl: string): string {
  const example = DEFAULT_DOCUMENSO_PUBLIC_URL;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch (error) {
    throw new Error(`Invalid DOCUMENSO_PUBLIC_URL: ${raw}`, { cause: error });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `DOCUMENSO_PUBLIC_URL must use http or https (got ${parsed.protocol}). Example: ${example}.`,
    );
  }
  const hostname = parsed.hostname;
  if (hostname.toLowerCase() === "localhost" || net.isIP(hostname) !== 0) {
    throw new Error(
      `DOCUMENSO_PUBLIC_URL hostname must not be localhost or an IP (got ${hostname}). Example: ${example}.`,
    );
  }
  const publicPort = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  const expectedPort = listenPort(listenUrl);
  if (publicPort !== expectedPort) {
    throw new Error(
      `DOCUMENSO_PUBLIC_URL port must match DOCUMENSO_BASE_URL listen port ${expectedPort} (got ${publicPort}).`,
    );
  }
  if (parsed.pathname !== "" && parsed.pathname !== "/") {
    throw new Error(`DOCUMENSO_PUBLIC_URL must not include a path (got ${parsed.pathname}).`);
  }
  return normalizeBaseUrl(parsed.origin);
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

  const listenUrlRaw = (
    process.env.DOCUMENSO_BASE_URL?.trim() ?? DEFAULT_DOCUMENSO_LISTEN_URL
  ).trim();
  const publicUrlRaw = (
    process.env.DOCUMENSO_PUBLIC_URL?.trim() ?? DEFAULT_DOCUMENSO_PUBLIC_URL
  ).trim();
  const dbUrlRaw = process.env.DOCUMENSO_DB_URL?.trim() ?? "";
  const inbucketOriginRaw = (
    process.env.DOCUMENSO_INBUCKET_ORIGIN?.trim() ?? DEFAULT_INBUCKET_ORIGIN
  ).trim();
  const missing = collectMissingEnv({
    DOCUMENSO_DB_URL: dbUrlRaw,
  });
  failOnMissingEnv(missing);

  const listenUrl = assertDocumensoListenUrl(listenUrlRaw);
  const publicUrl = assertDocumensoPublicUrl(publicUrlRaw, listenUrl);
  const dbUrl = assertDocumensoDbUrl(dbUrlRaw);
  const inbucketOrigin = normalizeBaseUrl(inbucketOriginRaw);

  process.env.DOCUMENSO_BASE_URL ??= listenUrl;
  process.env.DOCUMENSO_PUBLIC_URL ??= publicUrl;
  process.env.DOCUMENSO_DB_URL ??= dbUrl;
  process.env.DOCUMENSO_INBUCKET_ORIGIN ??= inbucketOrigin;

  cached = { baseUrl: publicUrl, dbUrl, inbucketOrigin };
  return cached;
}

export function documensoTimeouts(): DocumensoTimeoutBudget {
  return DOCUMENSO_TIMEOUTS;
}

/** Chromium flag so HTTP passkey origin (non-localhost host) is a secure context for WebAuthn. */
export function documensoTreatInsecureOriginAsSecureLaunchArg(): string {
  const publicUrl = loadDocumensoConfig().baseUrl;
  return `--unsafely-treat-insecure-origin-as-secure=${publicUrl}`;
}
