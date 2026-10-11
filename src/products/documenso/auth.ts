import { request, type APIRequestContext } from "@playwright/test";
import { totpMsLeftInStep } from "../../core/totp.js";
import { DOCUMENSO_ROUTES, documensoTimeouts, loadDocumensoConfig } from "./env.js";

export const DOC_INVALID_TWO_FACTOR_CODE = "INVALID_TWO_FACTOR_CODE" as const;
export const DOC_INCORRECT_TWO_FACTOR_CODE = "INCORRECT_TWO_FACTOR_CODE" as const;
export const DOC_TWO_FACTOR_MISSING_CREDENTIALS = "TWO_FACTOR_MISSING_CREDENTIALS" as const;

const TOTP_SECRET_PATTERN = /^[A-Z2-7]{16}$/;
const BACKUP_CODE_PATTERN = /^[0-9A-F]{5}-[0-9A-F]{5}$/;

export interface DocumensoAuthorizeInput {
  readonly email: string;
  readonly password: string;
  readonly totpCode?: string;
  readonly backupCode?: string;
}

export interface DocumensoAuthorizeResult {
  readonly status: number;
  readonly code: string | undefined;
  readonly message: string | undefined;
  readonly hasSessionCookie: boolean;
  /** Wall-clock ms immediately before POST /email-password/authorize. */
  readonly authorizeRequestedAtMs: number;
}

export interface DocumensoSessionPayload {
  readonly isAuthenticated: boolean;
  readonly user: { readonly email: string } | null;
}

export interface DocumensoTwoFactorSetupResult {
  readonly secret: string;
  readonly uri: string;
}

export interface DocumensoTwoFactorEnableResult {
  readonly backupCodes: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCsrfToken(payload: unknown): string {
  if (
    !isRecord(payload) ||
    typeof payload.csrfToken !== "string" ||
    payload.csrfToken.length === 0
  ) {
    throw new Error("GET /api/auth/csrf returned a JSON body without csrfToken");
  }
  return payload.csrfToken;
}

function parseAuthorizeBody(payload: unknown): {
  code: string | undefined;
  message: string | undefined;
} {
  if (!isRecord(payload)) {
    return { code: undefined, message: undefined };
  }
  const code = payload.code;
  const message = payload.message;
  return {
    code: typeof code === "string" ? code : undefined,
    message: typeof message === "string" ? message : undefined,
  };
}

export function documensoHasSessionIdCookie(cookies: readonly { name: string }[]): boolean {
  return cookies.some(
    (cookie) => cookie.name === "sessionId" || cookie.name.endsWith("-sessionId"),
  );
}

async function csrfTokenForAuthorize(http: APIRequestContext): Promise<string> {
  const csrfResponse = await http.get(DOCUMENSO_ROUTES.csrf, {
    timeout: documensoTimeouts().request,
  });
  if (!csrfResponse.ok()) {
    throw new Error(`GET ${DOCUMENSO_ROUTES.csrf} failed (HTTP ${String(csrfResponse.status())})`);
  }
  return readCsrfToken(await csrfResponse.json());
}

function assertTotpSecret(secret: string): string {
  if (!TOTP_SECRET_PATTERN.test(secret)) {
    throw new Error("Documenso 2FA setup secret format is invalid");
  }
  return secret;
}

export function readJsonErrorCode(body: unknown): string | undefined {
  if (!isRecord(body) || typeof body.code !== "string") {
    return undefined;
  }
  return body.code;
}

export function twoFactorEnableFailureMessage(
  httpStatus: number,
  body: unknown,
  codeMintedAtMs: number,
): string {
  const jsonCode = readJsonErrorCode(body);
  return `POST ${DOCUMENSO_ROUTES.twoFactorEnable} failed (HTTP ${String(httpStatus)}, code=${jsonCode ?? "none"}, totpMsLeftInStep=${String(totpMsLeftInStep(codeMintedAtMs))})`;
}

function assertBackupCodes(codes: readonly string[]): readonly string[] {
  if (codes.length !== 10) {
    throw new Error(`Documenso 2FA enable expected 10 backup codes, got ${String(codes.length)}`);
  }
  for (const code of codes) {
    if (!BACKUP_CODE_PATTERN.test(code)) {
      throw new Error("Documenso 2FA backup code format is invalid");
    }
  }
  return codes;
}

export async function loginViaApi(
  http: APIRequestContext,
  input: DocumensoAuthorizeInput,
): Promise<DocumensoAuthorizeResult> {
  const csrfToken = await csrfTokenForAuthorize(http);
  const body: Record<string, string> = {
    email: input.email,
    password: input.password,
    csrfToken,
  };
  if (input.totpCode !== undefined) {
    body.totpCode = input.totpCode;
  }
  if (input.backupCode !== undefined) {
    body.backupCode = input.backupCode;
  }

  const authorizeRequestedAtMs = Date.now();
  const response = await http.post(DOCUMENSO_ROUTES.emailPasswordAuthorize, {
    data: body,
    timeout: documensoTimeouts().request,
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  const parsed = parseAuthorizeBody(payload);
  const cookies = (await http.storageState()).cookies;

  return {
    status: response.status(),
    code: parsed.code,
    message: parsed.message,
    hasSessionCookie: documensoHasSessionIdCookie(cookies),
    authorizeRequestedAtMs,
  };
}

export async function readSession(http: APIRequestContext): Promise<DocumensoSessionPayload> {
  const response = await http.get(DOCUMENSO_ROUTES.session, {
    timeout: documensoTimeouts().request,
  });
  if (!response.ok()) {
    throw new Error(`GET ${DOCUMENSO_ROUTES.session} failed (HTTP ${String(response.status())})`);
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload)) {
    throw new Error("GET /api/auth/session returned non-object JSON");
  }
  const isAuthenticated = payload.isAuthenticated === true;
  const userRaw = payload.user;
  let user: { email: string } | null = null;
  if (isRecord(userRaw) && typeof userRaw.email === "string") {
    user = { email: userRaw.email };
  }
  return { isAuthenticated, user };
}

export function sessionHasEmail(session: DocumensoSessionPayload, email: string): boolean {
  if (!session.isAuthenticated || session.user === null) {
    return false;
  }
  return session.user.email.toLowerCase() === email.toLowerCase();
}

export async function setupTwoFactorViaApi(
  http: APIRequestContext,
): Promise<DocumensoTwoFactorSetupResult> {
  const response = await http.post(DOCUMENSO_ROUTES.twoFactorSetup, {
    timeout: documensoTimeouts().request,
  });
  if (!response.ok()) {
    throw new Error(
      `POST ${DOCUMENSO_ROUTES.twoFactorSetup} failed (HTTP ${String(response.status())})`,
    );
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload) || typeof payload.secret !== "string" || typeof payload.uri !== "string") {
    throw new Error("Documenso 2FA setup response shape is invalid");
  }
  return {
    secret: assertTotpSecret(payload.secret),
    uri: payload.uri,
  };
}

export async function enableTwoFactorViaApi(
  http: APIRequestContext,
  code: string,
  codeMintedAtMs: number,
): Promise<DocumensoTwoFactorEnableResult> {
  const response = await http.post(DOCUMENSO_ROUTES.twoFactorEnable, {
    data: { code },
    timeout: documensoTimeouts().request,
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  if (!response.ok()) {
    throw new Error(twoFactorEnableFailureMessage(response.status(), payload, codeMintedAtMs));
  }
  if (!isRecord(payload) || !Array.isArray(payload.recoveryCodes)) {
    throw new Error("Documenso 2FA enable response shape is invalid");
  }
  const codes = payload.recoveryCodes.filter((item): item is string => typeof item === "string");
  return { backupCodes: assertBackupCodes(codes) };
}

export function wrongTotpCodeFromLive(liveCode: string): string {
  const n = (Number(liveCode) + 1) % 1_000_000;
  return String(n).padStart(6, "0");
}

export async function newDocumensoApiContext(): Promise<APIRequestContext> {
  const { baseUrl } = loadDocumensoConfig();
  return request.newContext({ baseURL: baseUrl });
}

export interface DocumensoPasskeyAuthorizeBody {
  readonly csrfToken: string;
  readonly credential: string;
}

export interface DocumensoPasskeyAuthorizeResult {
  readonly status: number;
  readonly code: string | undefined;
  readonly hasSessionCookie: boolean;
}

export async function postPasskeyAuthorize(
  http: APIRequestContext,
  body: DocumensoPasskeyAuthorizeBody,
): Promise<DocumensoPasskeyAuthorizeResult> {
  const { baseUrl } = loadDocumensoConfig();
  const response = await http.post(DOCUMENSO_ROUTES.passkeyAuthorize, {
    data: body,
    headers: { Origin: baseUrl },
    timeout: documensoTimeouts().request,
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  const cookies = (await http.storageState()).cookies;
  return {
    status: response.status(),
    code: readJsonErrorCode(payload),
    hasSessionCookie: documensoHasSessionIdCookie(cookies),
  };
}
