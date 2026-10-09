import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  credentialsCallbackFailed,
  loginCalWithCredentials,
  postCalCredentials,
} from "../../../src/products/cal/auth.js";
import { loadConfig } from "../../../src/products/cal/env.js";
import { expect, test } from "../../../src/products/cal/fixtures.js";
import { BookingsPage } from "../../../src/products/cal/pages/bookings.page.js";

test.describe("Storage state", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "API login produces a reusable storageState",
    {
      tag: ["@cal", "@smoke"],
      annotation: { type: "testId", description: "P1-CAL-FW-001" },
    },
    async ({ browser, page, bookings }) => {
      await test.step("start from an empty session", async () => {
        await bookings.gotoUpcoming();
        await bookings.expectLoginRedirect();
      });

      const { email, password } = loadConfig();
      let loginMs = 0;

      await test.step("log in via the credentials API", async () => {
        loginMs = await loginCalWithCredentials(page, email, password);
        await expect(page).not.toHaveURL(/\/auth\/login/);
      });

      await test.step("reuse storageState in a new context", async () => {
        const stateDir = await mkdtemp(path.join(os.tmpdir(), "p1-fw001-storage-state-"));
        try {
          const statePath = path.join(stateDir, "storage-state.json");
          await page.context().storageState({ path: statePath });
          const reused = await browser.newContext({ storageState: statePath });
          const reusedPage = await reused.newPage();
          try {
            const reusedBookings = new BookingsPage(reusedPage);
            await reusedBookings.gotoUpcoming();
            await reusedBookings.expectAuthenticatedUpcoming();
            await expect(reusedPage).toHaveURL(/\/bookings\/upcoming/);
          } finally {
            await reused.close();
          }
        } finally {
          await rm(stateDir, { recursive: true, force: true });
        }
        console.log(`P1-CAL-FW-001 login ${String(loginMs)}ms`);
      });
    },
  );
});

test.describe("Credentials login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "wrong password does not create a session",
    {
      tag: ["@cal", "@smoke"],
      annotation: { type: "testId", description: "P1-CAL-FW-002" },
    },
    async ({ page, bookings }) => {
      const { email } = loadConfig();
      const result = await postCalCredentials(page, email, "this-password-is-wrong");
      expect(
        credentialsCallbackFailed({ url: result.url, error: result.error }),
        "Wrong password must not create a session (callback url/error or missing session)",
      ).toBeTruthy();
      await bookings.gotoUpcoming();
      await bookings.expectLoginRedirect();
    },
  );
});
