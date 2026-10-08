import { expect, test } from "@playwright/test";
import { loginCalWithCredentials, postCalCredentials } from "../../../src/auth/credentials.js";
import { calCredentials } from "../../../src/env.js";
import { BookingsPage } from "../../../src/pages/cal/bookings.page.js";

test.describe("P1-CAL-FW-001 API login produces reusable storageState", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("P1-CAL-FW-001 API login produces reusable storageState", async ({ browser, page }, testInfo) => {
    const beforeLogin = new BookingsPage(page);
    await beforeLogin.gotoUpcoming();
    await beforeLogin.expectLoginRedirect();

    const { email, password } = calCredentials();
    const started = Date.now();
    const loginMs = await loginCalWithCredentials(page, email, password);
    const statePath = testInfo.outputPath("storage-state.json");
    await page.context().storageState({ path: statePath });

    const reused = await browser.newContext({ storageState: statePath });
    const reusedPage = await reused.newPage();
    const bookings = new BookingsPage(reusedPage);
    await bookings.gotoUpcoming();
    await bookings.expectAuthenticatedUpcoming();
    const elapsedMs = Date.now() - started;
    console.log(`P1-CAL-FW-001 login ${loginMs}ms; reuse total ${elapsedMs}ms`);
    await reused.close();
  });
});

test.describe("P1-CAL-FW-002 Wrong password does not produce a session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("P1-CAL-FW-002 Wrong password does not produce a session", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      const { email } = calCredentials();
      const result = await postCalCredentials(page, email, "this-password-is-wrong");
      expect(result.ok, "Wrong password must not yield HTTP 2xx session").toBeFalsy();

      const bookings = new BookingsPage(page);
      await bookings.gotoUpcoming();
      await bookings.expectLoginRedirect();
    } finally {
      await context.close();
    }
  });
});
