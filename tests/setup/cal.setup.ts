import fs from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { installTimezoneHandler } from "../../src/products/cal/app-shell.js";
import { loginCalWithCredentials } from "../../src/products/cal/auth.js";
import { loadConfig } from "../../src/products/cal/env.js";

setup(
  "API login writes reusable Cal pro storageState",
  { tag: ["@cal", "@setup"] },
  async ({ page }) => {
    const { email, password, proAuthStatePath } = loadConfig();
    fs.mkdirSync(path.dirname(proAuthStatePath), { recursive: true });
    await installTimezoneHandler(page);
    const elapsedMs = await loginCalWithCredentials(page, email, password);
    await expect(page).not.toHaveURL(/\/auth\/login/);
    await page.context().storageState({ path: proAuthStatePath });
    console.log(`P1-CAL-FW setup pro login elapsed ${String(elapsedMs)}ms`);
  },
);

setup(
  "API login writes reusable Cal trial storageState",
  { tag: ["@cal", "@setup"] },
  async ({ page }) => {
    const { dstEmail, dstPassword, trialAuthStatePath } = loadConfig();
    fs.mkdirSync(path.dirname(trialAuthStatePath), { recursive: true });
    await installTimezoneHandler(page);
    const elapsedMs = await loginCalWithCredentials(page, dstEmail, dstPassword);
    await expect(page).not.toHaveURL(/\/auth\/login/);
    await page.context().storageState({ path: trialAuthStatePath });
    console.log(`P1-CAL-DST setup trial login elapsed ${String(elapsedMs)}ms`);
  },
);
