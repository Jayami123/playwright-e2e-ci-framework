import { expect, test } from "../../../src/products/cal/fixtures.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import { CAL_FROZEN_SLOT_COUNT } from "../../../src/products/cal/visual.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";

test.describe("Cal Arabic RTL locale", () => {
  test.use({ storageState: { cookies: [], origins: [] }, locale: "ar" });

  test(
    "P1-CAL-I18N-003 booker mirrors in Arabic and matches the baseline",
    { tag: ["@cal", "@visual"], annotation: { type: "testId", description: "P1-CAL-I18N-003" } },
    async ({ page, booker }, testInfo) => {
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      await booker.gotoProThirtyMin();
      await booker.expectLoaded();
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);
      expect(await page.evaluate<string>("document.documentElement.lang")).toBe("ar");
      expect(await page.evaluate<string>("document.documentElement.dir")).toBe("rtl");
      expect(await page.evaluate<string>("getComputedStyle(document.body).direction")).toBe("rtl");
      await expect(page.getByTestId(CAL_TEST_IDS.selectedMonthLabel)).toHaveText("يناير 2030");

      // Do not assert Arabic accessible names (Step 0 read only aria-label attributes); mirroring is proven by position.
      const previous = page.getByTestId(CAL_TEST_IDS.decrementMonth);
      const next = page.getByTestId(CAL_TEST_IDS.incrementMonth);
      await expect(previous).toBeVisible();
      await expect(next).toBeVisible();
      const prevBox = await previous.boundingBox();
      const nextBox = await next.boundingBox();
      if (prevBox === null || nextBox === null) {
        throw new Error("month navigation buttons have no bounding box");
      }
      expect(prevBox.x, "previous-month sits right of next-month in RTL").toBeGreaterThan(
        nextBox.x,
      );

      if (testInfo.project.name !== "visual-mobile") {
        const metaBox = await page.getByTestId(CAL_TEST_IDS.eventMeta).boundingBox();
        const slotBox = await booker.firstSlot().boundingBox();
        if (metaBox === null || slotBox === null) {
          throw new Error("event meta or first slot has no bounding box");
        }
        expect(metaBox.x, "event meta column is mirrored to the right").toBeGreaterThan(slotBox.x);
      }
      await stableScreenshot(page, "booker-ar", { mask: maskLocators(page, "cal") });
    },
  );
});
