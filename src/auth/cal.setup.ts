import fs from "node:fs";
import path from "node:path";
import { expect, test as setup } from "@playwright/test";
import { AUTH_STATE_PATH, calCredentials } from "../env.js";
import { loginCalWithCredentials } from "./credentials.js";

setup("P1-CAL-FW setup: API login writes .auth/cal-pro.json", async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
  const { email, password } = calCredentials();
  const elapsedMs = await loginCalWithCredentials(page, email, password);
  await expect(page).not.toHaveURL(/\/auth\/login/);
  await page.context().storageState({ path: AUTH_STATE_PATH });
  // Measured only -- no target claimed (Phase 2 timings live elsewhere).
  console.log(`P1-CAL-FW setup login elapsed ${elapsedMs}ms`);
});
