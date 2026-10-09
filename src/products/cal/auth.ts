import { expect, request, type APIRequestContext, type Page } from "@playwright/test";
import { loadConfig, timeouts } from "./env.js";
import { CAL_ROUTES } from "./routes.js";

export interface CalLoginResult {
  readonly ok: boolean;
  readonly status: number;
  readonly elapsedMs: number;
  readonly url: string | undefined;
  readonly error: string | undefined;
}

export interface CalCredentialsCallbackBody {
  readonly url: string | undefined;
  readonly error: string | undefined;
}

export interface CookieNameValue {
  readonly name: string;
  readonly value: string;
}

const CSRF_COOKIE_NAMES: ReadonlySet<string> = new Set([
  "next-auth.csrf-token",
  "__Secure-next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
]);

const CALLBACK_FAILURE_URL =
  /\/auth\/login(?:[/?#]|$)|\/api\/auth\/signin(?:[/?#]|$)|[?&]csrf=true(?:&|$)|[?&]error=/i;

export const CREDENTIALS_SIGNIN_ERROR = "CredentialsSignin" as const;
/** Cal v6 self-hosted maps failed password checks to this NextAuth error query param (not CSRF). */
export const CAL_INCORRECT_EMAIL_PASSWORD_ERROR = "incorrect-email-password" as const;
export const CAL_INCORRECT_TWO_FACTOR_CODE = "incorrect-two-factor-code" as const;
export const CAL_INCORRECT_BACKUP_CODE = "incorrect-backup-code" as const;

const WRONG_PASSWORD_CALLBACK_ERRORS: ReadonlySet<string> = new Set([
  CREDENTIALS_SIGNIN_ERROR,
  CAL_INCORRECT_EMAIL_PASSWORD_ERROR,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readCsrfToken(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || !("csrfToken" in payload)) {
    throw new Error("GET /api/auth/csrf returned a JSON body without csrfToken");
  }
  const token = payload.csrfToken;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("GET /api/auth/csrf csrfToken must be a non-empty string");
  }
  return token;
}

function decodeCookieValue(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch (error) {
    throw new Error("Failed to decode auth cookie value", { cause: error });
  }
}

export function csrfTokenFromCookies(cookies: readonly CookieNameValue[]): string | undefined {
  for (const cookie of cookies) {
    if (!CSRF_COOKIE_NAMES.has(cookie.name)) {
      continue;
    }
    const token = decodeCookieValue(cookie.value).split("|")[0];
    if (token !== undefined && token.length > 0) {
      return token;
    }
  }
  return undefined;
}

export function parseCalCredentialsCallback(payload: unknown): CalCredentialsCallbackBody {
  if (!isRecord(payload)) {
    throw new Error("Cal credentials callback JSON must be an object");
  }
  const url = payload.url;
  const error = payload.error;
  return {
    url: typeof url === "string" ? url : undefined,
    error: typeof error === "string" ? error : undefined,
  };
}

export function credentialsCallbackErrorParam(
  body: CalCredentialsCallbackBody,
): string | undefined {
  if (body.error !== undefined && body.error.length > 0) {
    return body.error;
  }
  if (body.url === undefined || body.url.length === 0) {
    return undefined;
  }
  try {
    return new URL(body.url, "http://127.0.0.1").searchParams.get("error") ?? undefined;
  } catch {
    const match = /[?&]error=([^&]+)/.exec(body.url);
    return match?.[1];
  }
}

export function wrongPasswordCallbackFailed(body: CalCredentialsCallbackBody): boolean {
  const errorParam = credentialsCallbackErrorParam(body);
  return errorParam !== undefined && WRONG_PASSWORD_CALLBACK_ERRORS.has(errorParam);
}

export function credentialsCallbackFailed(body: CalCredentialsCallbackBody): boolean {
  if (wrongPasswordCallbackFailed(body)) {
    return true;
  }
  if (body.error !== undefined && body.error.length > 0) {
    return true;
  }
  if (body.url === undefined || body.url.length === 0) {
    return true;
  }
  return CALLBACK_FAILURE_URL.test(body.url);
}

export function assertCalCredentialsCallbackSucceeded(
  body: CalCredentialsCallbackBody,
  httpStatus: number,
): void {
  if (!credentialsCallbackFailed(body)) {
    return;
  }
  const urlPart = body.url === undefined ? "missing url" : `url=${body.url}`;
  const errorPart = body.error === undefined ? "" : `, error=${body.error}`;
  throw new Error(
    `Cal credentials callback did not create a session (HTTP ${String(httpStatus)}, ${urlPart}${errorPart})`,
  );
}

export function sessionHasUser(payload: unknown): boolean {
  if (!isRecord(payload)) {
    return false;
  }
  const user = payload.user;
  if (!isRecord(user)) {
    return false;
  }
  return typeof user.email === "string" && user.email.length > 0;
}

export function sessionHasEmail(payload: unknown, email: string): boolean {
  if (!isRecord(payload)) {
    return false;
  }
  const user = payload.user;
  if (!isRecord(user)) {
    return false;
  }
  return user.email === email;
}

export async function readCalSessionPayload(http: APIRequestContext): Promise<unknown> {
  const response = await http.get(CAL_ROUTES.session, { timeout: timeouts().csrf });
  expect(
    response.ok(),
    `GET /api/auth/session failed (HTTP ${String(response.status())})`,
  ).toBeTruthy();
  return response.json();
}

export async function pollSessionHasEmail(http: APIRequestContext, email: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const payload = await readCalSessionPayload(http);
        return sessionHasEmail(payload, email);
      },
      {
        timeout: timeouts().page,
        message: `GET /api/auth/session did not return user email ${email}`,
      },
    )
    .toBe(true);
}

export interface CalTotpSetupPayload {
  readonly secret: string;
  readonly backupCodes: readonly string[];
}

function parseTotpSetupPayload(payload: unknown): CalTotpSetupPayload {
  if (!isRecord(payload)) {
    throw new Error("Cal TOTP setup JSON must be an object");
  }
  const secret = payload.secret;
  const backupCodes = payload.backupCodes;
  if (typeof secret !== "string" || secret.length !== 32) {
    throw new Error("Cal TOTP setup secret must be a 32-character string");
  }
  if (!Array.isArray(backupCodes) || backupCodes.some((code) => typeof code !== "string")) {
    throw new Error("Cal TOTP setup backupCodes must be a string array");
  }
  return { secret, backupCodes };
}

export async function setupCalTotpViaApi(
  http: APIRequestContext,
  password: string,
): Promise<CalTotpSetupPayload> {
  const response = await http.post(CAL_ROUTES.totpSetup, {
    data: { password },
    headers: { "Content-Type": "application/json" },
    timeout: timeouts().csrf,
  });
  const payload: unknown = await response.json();
  if (!response.ok()) {
    throw new Error(`Cal TOTP setup failed (HTTP ${String(response.status())})`, {
      cause: payload,
    });
  }
  return parseTotpSetupPayload(payload);
}

export async function enableCalTotpViaApi(http: APIRequestContext, code: string): Promise<void> {
  const response = await http.post(CAL_ROUTES.totpEnable, {
    data: { code },
    headers: { "Content-Type": "application/json" },
    timeout: timeouts().csrf,
  });
  if (!response.ok()) {
    const payload: unknown = await response.json().catch(() => undefined);
    throw new Error(`Cal TOTP enable failed (HTTP ${String(response.status())})`, {
      cause: payload,
    });
  }
}

async function csrfTokenForCredentials(http: APIRequestContext): Promise<string> {
  const csrfResponse = await http.get(CAL_ROUTES.csrf, { timeout: timeouts().csrf });
  expect(
    csrfResponse.ok(),
    `GET /api/auth/csrf failed (${String(csrfResponse.status())})`,
  ).toBeTruthy();
  const fromJson = readCsrfToken(await csrfResponse.json());
  const fromCookie = csrfTokenFromCookies((await http.storageState()).cookies);
  return fromCookie ?? fromJson;
}

async function waitForCalSessionUser(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const response = await page.request.get(CAL_ROUTES.session, { timeout: timeouts().csrf });
        if (!response.ok()) {
          return false;
        }
        return sessionHasUser(await response.json());
      },
      {
        timeout: timeouts().page,
        message: "GET /api/auth/session did not return a user after credentials login",
      },
    )
    .toBe(true);
}

export interface CalCredentialFactors {
  readonly totpCode?: string;
  readonly backupCode?: string;
}

export async function postCalCredentials(
  http: APIRequestContext,
  email: string,
  password: string,
  factors: CalCredentialFactors = {},
): Promise<CalLoginResult> {
  const started = Date.now();
  const config = loadConfig();
  const csrfToken = await csrfTokenForCredentials(http);

  const form: Record<string, string> = {
    email,
    password,
    csrfToken,
    callbackURL: config.baseUrl,
    redirect: "false",
    json: "true",
  };
  if (factors.totpCode !== undefined) {
    form.totpCode = factors.totpCode;
  }
  if (factors.backupCode !== undefined) {
    form.backupCode = factors.backupCode;
  }

  const loginResponse = await http.post(CAL_ROUTES.credentialsCallback, {
    form,
  });

  let payload: unknown;
  try {
    payload = await loginResponse.json();
  } catch (error) {
    throw new Error(
      `Cal credentials callback did not return JSON (HTTP ${String(loginResponse.status())})`,
      { cause: error },
    );
  }
  const body = parseCalCredentialsCallback(payload);

  return {
    ok: loginResponse.ok(),
    status: loginResponse.status(),
    elapsedMs: Date.now() - started,
    url: body.url,
    error: body.error,
  };
}

export async function loginCalWithCredentials(
  page: Page,
  email: string,
  password: string,
): Promise<number> {
  const config = loadConfig();
  const isolated = await request.newContext({ baseURL: config.baseUrl });
  try {
    const result = await postCalCredentials(isolated, email, password);
    expect(result.ok, `Cal credentials login failed (HTTP ${String(result.status)})`).toBeTruthy();
    assertCalCredentialsCallbackSucceeded({ url: result.url, error: result.error }, result.status);
    const { cookies } = await isolated.storageState();
    await page.context().addCookies(cookies);
    await waitForCalSessionUser(page);
    await page.goto(CAL_ROUTES.bookingsUpcoming, { waitUntil: "domcontentloaded" });
    return result.elapsedMs;
  } finally {
    await isolated.dispose();
  }
}
