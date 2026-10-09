import { expect, type Page } from "@playwright/test";
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

export function credentialsCallbackFailed(body: CalCredentialsCallbackBody): boolean {
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

async function csrfTokenForCredentials(page: Page): Promise<string> {
  const csrfResponse = await page.request.get(CAL_ROUTES.csrf, { timeout: timeouts().csrf });
  expect(
    csrfResponse.ok(),
    `GET /api/auth/csrf failed (${String(csrfResponse.status())})`,
  ).toBeTruthy();
  const fromJson = readCsrfToken(await csrfResponse.json());
  const fromCookie = csrfTokenFromCookies(await page.context().cookies());
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

export async function postCalCredentials(
  page: Page,
  email: string,
  password: string,
): Promise<CalLoginResult> {
  const started = Date.now();
  const config = loadConfig();
  const csrfToken = await csrfTokenForCredentials(page);

  const loginResponse = await page.request.post(CAL_ROUTES.credentialsCallback, {
    form: {
      email,
      password,
      csrfToken,
      callbackURL: config.baseUrl,
      redirect: "false",
      json: "true",
    },
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
  const result = await postCalCredentials(page, email, password);
  expect(result.ok, `Cal credentials login failed (HTTP ${String(result.status)})`).toBeTruthy();
  assertCalCredentialsCallbackSucceeded(result, result.status);
  await waitForCalSessionUser(page);
  await page.goto(CAL_ROUTES.bookingsUpcoming, { waitUntil: "domcontentloaded" });
  return result.elapsedMs;
}
