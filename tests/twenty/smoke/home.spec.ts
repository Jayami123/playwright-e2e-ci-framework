import { expect, test } from "@playwright/test";
import { twentyTimeouts } from "../../../src/products/twenty/env.js";
import { TwentyHomePage } from "../../../src/products/twenty/pages/home.page.js";

test(
  "Jane workspace shows Companies home navigation",
  { tag: ["@twenty-smoke", "@twenty", "@smoke"] },
  async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/objects\/companies/, { timeout: twentyTimeouts().page });
    await expect(page).not.toHaveURL(/welcome/);
    const home = new TwentyHomePage(page);
    await expect(home.companiesLink).toBeVisible({ timeout: twentyTimeouts().page });
    await expect(home.peopleLink).toBeVisible({ timeout: twentyTimeouts().page });
  },
);
