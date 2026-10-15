import { expect, test } from "@playwright/test";
import { BookerPage } from "../../../src/products/cal/pages/booker.page.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import { CAL_FROZEN_SLOT_COUNT } from "../../../src/products/cal/visual.js";
import { attachAxeReport, axeScan } from "../../../src/support/visual/axe.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";

test.describe("Cal a11y pipeline smoke", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "booker /pro/30min axe scan is attached to the report",
    {
      tag: ["@cal", "@a11y"],
      annotation: { type: "testId", description: "P1-CAL-A11Y-SMOKE" },
    },
    async ({ page }, testInfo) => {
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      const booker = new BookerPage(page);
      await booker.gotoProThirtyMin();
      await booker.expectLoaded();
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);
      const scan = await axeScan(page, {
        include: [`[data-testid="${CAL_TEST_IDS.bookerContainer}"]`],
      });
      await attachAxeReport(testInfo, "axe-booker-pro-30min", scan.report);
      testInfo.annotations.push({ type: "axe-blocking", description: String(scan.blockingCount) });
      // Task 1 records only; violation assertions arrive with the VIS/a11y case tasks (ADR 0017).
      expect(testInfo.attachments.map((a) => a.name)).toContain("axe-booker-pro-30min.json");
      expect(scan.passes).toBeGreaterThan(0);
    },
  );
});
