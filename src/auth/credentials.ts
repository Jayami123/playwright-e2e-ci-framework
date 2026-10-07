import { expect, type Page } from "@playwright/test";
import { calBaseUrl } from "../env.js";

export interface CalLoginResult {
  ok: boolean;
  status: number;
  elapsedMs: number;
}

/**
 * NextAuth credentials login used by the cal.diy Playwright fixture
 * (`apps/web/playwright/fixtures/users.ts` apiLogin).
 */
export async function postCalCredentials(
  page: Page,
  email: string,
  password: string,
): Promise<CalLoginResult> {
  const started = Date.now();
  const csrfResponse = await page.request.get("/api/auth/csrf");
  expect(csrfResponse.ok(), `GET /api/auth/csrf failed (${csrfResponse.status()})`).toBeTruthy();
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };

  const loginResponse = await page.request.post("/api/auth/callback/credentials", {
    form: {
      email,
      password,
      csrfToken,
      callbackURL: calBaseUrl(),
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

export async function loginCalWithCredentials(page: Page, email: string, password: string): Promise<number> {
  const result = await postCalCredentials(page, email, password);
  expect(result.ok, `Cal credentials login failed (HTTP ${result.status})`).toBeTruthy();
  await page.goto("/bookings/upcoming", { waitUntil: "domcontentloaded" });
  return result.elapsedMs;
}
