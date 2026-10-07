import { BookingsPage } from "../../../src/pages/cal/bookings.page.js";
import { expect, test } from "../../../src/fixtures/test.js";

test.describe("P1-CAL-FW-004 Console/page-error guard", () => {
  test("P1-CAL-FW-004 Console/page-error guard", async ({ page, consoleGuard }) => {
    test.setTimeout(300_000);
    await page.goto("/pro/30min", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading").first()).toBeVisible();

    const bookings = new BookingsPage(page);
    await bookings.gotoUpcoming();
    await bookings.expectAuthenticatedUpcoming();

    expect(consoleGuard.errors).toEqual([]);
  });
});
