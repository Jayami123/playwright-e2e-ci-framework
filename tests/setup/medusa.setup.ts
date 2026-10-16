import fs from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { createAdminSession, loginAdminToken } from "../../src/products/medusa/admin-api.js";
import { loadMedusaConfig, MEDUSA_ROUTES } from "../../src/products/medusa/env.js";
import { MedusaOrdersPage } from "../../src/products/medusa/pages/orders.page.js";

setup(
  "API login writes reusable Medusa admin storageState",
  { tag: ["@medusa", "@setup"] },
  async ({ page }) => {
    const { adminEmail, adminPassword, authStatePath } = loadMedusaConfig();
    fs.mkdirSync(path.dirname(authStatePath), { recursive: true });

    const token = await loginAdminToken(page.request, adminEmail, adminPassword);
    await createAdminSession(page.request, token);
    const cookies = await page.context().cookies();
    expect(
      cookies.map((cookie) => cookie.name),
      "session cookie after POST /auth/session",
    ).toContain("connect.sid");

    await page.goto(MEDUSA_ROUTES.orders);
    await expect(new MedusaOrdersPage(page).heading).toBeVisible();
    await page.context().storageState({ path: authStatePath });
  },
);
