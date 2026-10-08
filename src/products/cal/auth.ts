import { expect, type Page } from "@playwright/test";
import { installTimezoneHandler } from "./app-shell.js";
import { loadConfig, timeouts } from "./env.js";
import { CAL_ROUTES } from "./routes.js";

export interface CalLoginResult {
  readonly ok: boolean;
  readonly status: number;
  readonly elapsedMs: number;
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

export async function postCalCredentials(
  page: Page,
  email: string,
  password: string,
): Promise<CalLoginResult> {
  const started = Date.now();
  const config = loadConfig();
  const csrfResponse = await page.request.get(CAL_ROUTES.csrf, { timeout: timeouts().csrf });
  expect(
    csrfResponse.ok(),
    `GET /api/auth/csrf failed (${String(csrfResponse.status())})`,
  ).toBeTruthy();
  const csrfToken = readCsrfToken(await csrfResponse.json());

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

  return {
    ok: loginResponse.ok(),
    status: loginResponse.status(),
    elapsedMs: Date.now() - started,
  };
}

export async function loginCalWithCredentials(
  page: Page,
  email: string,
  password: string,
): Promise<number> {
  const result = await postCalCredentials(page, email, password);
  expect(result.ok, `Cal credentials login failed (HTTP ${String(result.status)})`).toBeTruthy();
  await installTimezoneHandler(page);
  await page.goto(CAL_ROUTES.bookingsUpcoming, { waitUntil: "domcontentloaded" });
  return result.elapsedMs;
}
