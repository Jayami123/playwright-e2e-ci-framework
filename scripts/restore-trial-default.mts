import "dotenv/config";
import { chromium } from "@playwright/test";
import { CalAppShell, installTimezoneHandler } from "../src/products/cal/app-shell.js";
import { loginCalWithCredentials } from "../src/products/cal/auth.js";
import { setDefaultScheduleByName } from "../src/products/cal/db.js";
import { loadConfig } from "../src/products/cal/env.js";
import { AvailabilityPage } from "../src/products/cal/pages/availability.page.js";
import { WORKING_HOURS_SCHEDULE_NAME } from "../src/products/cal/schedules.js";

async function main(): Promise<void> {
  const { dstEmail, dstPassword, baseUrl } = loadConfig();
  const updated = await setDefaultScheduleByName(dstEmail, WORKING_HOURS_SCHEDULE_NAME);
  console.log(
    `Set ${dstEmail} default schedule to ${WORKING_HOURS_SCHEDULE_NAME} (${String(updated)} row(s)).`,
  );
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL: baseUrl });
    const page = await context.newPage();
    await installTimezoneHandler(page);
    await page.goto("/");
    await loginCalWithCredentials(page, dstEmail, dstPassword);
    await new CalAppShell(page).waitUntilReady();
    const availability = new AvailabilityPage(page);
    await availability.deleteQaSchedules();
    await context.close();
    console.log("Removed sch-qa-* schedules.");
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
