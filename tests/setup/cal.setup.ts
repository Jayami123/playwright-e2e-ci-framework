import fs from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { loginCalWithCredentials } from "../../src/products/cal/auth.js";
import { loadConfig } from "../../src/products/cal/env.js";

setup("API login writes reusable Cal storageState", async ({ page }) => {
  const { email, password, authStatePath } = loadConfig();
  fs.mkdirSync(path.dirname(authStatePath), { recursive: true });
  const elapsedMs = await loginCalWithCredentials(page, email, password);
  await expect(page).not.toHaveURL(/\/auth\/login/);
  await page.context().storageState({ path: authStatePath });
  console.log(`P1-CAL-FW setup login elapsed ${String(elapsedMs)}ms`);
});
