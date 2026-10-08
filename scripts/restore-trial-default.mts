import { chromium } from "@playwright/test";
import { installTimezoneHandler } from "../src/products/cal/app-shell.js";
import { loginCalWithCredentials } from "../src/products/cal/auth.js";
import { loadConfig } from "../src/products/cal/env.js";
import { AvailabilityPage } from "../src/products/cal/pages/availability.page.js";

async function main(): Promise<void> {
  const { dstEmail, dstPassword, baseUrl } = loadConfig();
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await installTimezoneHandler(page);
  await page.goto(baseUrl);
  await loginCalWithCredentials(page, dstEmail, dstPassword);
  const availability = new AvailabilityPage(page);
  await availability.promoteWorkingHoursDefault();
  await availability.deleteQaSchedules();
  await browser.close();
  console.log("Restored trial default schedule and removed sch-qa-* schedules.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
