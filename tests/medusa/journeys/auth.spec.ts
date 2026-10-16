import { expect, test } from "@playwright/test";
import { loadMedusaConfig, MEDUSA_ROUTES } from "../../../src/products/medusa/env.js";
import { MedusaLoginPage } from "../../../src/products/medusa/pages/login.page.js";
import { MedusaOrdersPage } from "../../../src/products/medusa/pages/orders.page.js";

test(
  "P1-MED-FW-001 Admin API login → session storageState",
  {
    tag: ["@medusa", "@auth", "@smoke"],
    annotation: [
      { type: "testId", description: "P1-MED-FW-001" },
      { type: "priority", description: "P0" },
    ],
  },
  async ({ page }) => {
    const { adminEmail } = loadMedusaConfig();
    const orders = new MedusaOrdersPage(page);
    const login = new MedusaLoginPage(page);

    await test.step("open orders with saved session", async () => {
      await orders.goto();
      await expect(page).toHaveURL(/\/app\/orders$/);
    });
    await test.step("orders list is visible", async () => {
      await expect(orders.heading).toBeVisible();
    });
    await test.step("login form is absent", async () => {
      await expect(login.email).toHaveCount(0);
    });
    await test.step("session is valid on the API", async () => {
      const response = await page.request.get(MEDUSA_ROUTES.usersMe);
      expect(response.status(), "GET /admin/users/me").toBe(200);
      const body = (await response.json()) as { user: { email: string } };
      expect(body.user.email).toBe(adminEmail);
    });
  },
);

test.describe("unauthenticated", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "P1-MED-FW-005 Invalid login shows an error, no session",
    {
      tag: ["@medusa", "@auth"],
      annotation: [
        { type: "testId", description: "P1-MED-FW-005" },
        { type: "priority", description: "P1" },
      ],
    },
    async ({ page }) => {
      const { adminEmail, adminPassword } = loadMedusaConfig();
      const login = new MedusaLoginPage(page);

      await test.step("open login", async () => {
        await login.goto();
        await expect(login.heading).toBeVisible();
      });
      await test.step("submit wrong password", async () => {
        await login.signIn(adminEmail, `${adminPassword}-wrong`);
      });
      await test.step("error is shown", async () => {
        await expect(login.error).toBeVisible();
        await expect(login.email).toHaveAttribute("aria-invalid", "true");
        await expect(page).toHaveURL(/\/app\/login/);
      });
      await test.step("no session cookie", async () => {
        const names = (await page.context().cookies()).map((cookie) => cookie.name);
        expect(names).not.toContain("connect.sid");
      });
      await test.step("API confirms no session", async () => {
        const response = await page.request.get(MEDUSA_ROUTES.usersMe);
        expect(response.status(), "GET /admin/users/me").toBe(401);
      });
    },
  );
});
