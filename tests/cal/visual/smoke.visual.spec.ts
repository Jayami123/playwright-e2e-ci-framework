import { expect, test } from "../../../src/products/cal/fixtures.js";
import { BookerPage } from "../../../src/products/cal/pages/booker.page.js";
import { CAL_FROZEN_SLOT_COUNT } from "../../../src/products/cal/visual.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";

test.describe("Cal visual pipeline smoke", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "booker /pro/30min matches the frozen-clock baseline",
    {
      tag: ["@cal", "@visual"],
      annotation: { type: "testId", description: "P1-CAL-VIS-SMOKE" },
    },
    async ({ page }) => {
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      const booker = new BookerPage(page);
      await booker.gotoProThirtyMin();
      await booker.expectLoaded();
      // Probe: early screenshots differ 20–65% until slots render.
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);
      await stableScreenshot(page, "booker-pro-30min", { mask: maskLocators(page, "cal") });
    },
  );
});
