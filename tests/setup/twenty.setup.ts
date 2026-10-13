import fs from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { loadTwentyConfig, twentyTimeouts } from "../../src/products/twenty/env.js";
import { TwentyLoginPage } from "../../src/products/twenty/pages/login.page.js";

setup(
  "UI login writes reusable Twenty Jane storageState",
  { tag: ["@twenty", "@setup"] },
  async ({ page }) => {
    const { email, password, authStatePath } = loadTwentyConfig();
    fs.mkdirSync(path.dirname(authStatePath), { recursive: true });
    const loginPage = new TwentyLoginPage(page);
    await loginPage.goto();
    await loginPage.signIn(email, password);
    await expect(page).toHaveURL(/\/objects\/companies/, { timeout: twentyTimeouts().page });
    await expect(page).not.toHaveURL(/welcome/);
    await page.context().storageState({ path: authStatePath });
    console.log("Twenty setup UI login wrote storageState");
  },
);
