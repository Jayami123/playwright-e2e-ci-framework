import "dotenv/config";
import { chromium } from "@playwright/test";
import { CalAppShell, installTimezoneHandler } from "../src/products/cal/app-shell.js";
import { loginCalWithCredentials } from "../src/products/cal/auth.js";
import { loadConfig } from "../src/products/cal/env.js";
import { AvailabilityPage } from "../src/products/cal/pages/availability.page.js";

async function main(): Promise<void> {
  const { dstEmail, dstPassword, baseUrl } = loadConfig();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL: baseUrl });
    const page = await context.newPage();
    await installTimezoneHandler(page);
    await page.goto("/");
    await loginCalWithCredentials(page, dstEmail, dstPassword);
    await new CalAppShell(page).waitUntilReady();
    const availability = new AvailabilityPage(page);
    await availability.promoteWorkingHoursDefault(dstEmail);
    await availability.deleteQaSchedules();
    await context.close();
    console.log("Restored trial default schedule and removed sch-qa-* schedules.");
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
