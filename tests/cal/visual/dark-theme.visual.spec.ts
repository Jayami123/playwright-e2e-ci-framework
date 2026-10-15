import { expect, test } from "../../../src/products/cal/fixtures.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import { CAL_FROZEN_SLOT_COUNT } from "../../../src/products/cal/visual.js";
import { attachAxeReport, axeScan, describeViolation } from "../../../src/support/visual/axe.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";

const BOOKER_INCLUDE = [`[data-testid="${CAL_TEST_IDS.bookerContainer}"]`];

test.describe("P1-CAL-VIS-003 theme", () => {
  test.use({ storageState: { cookies: [], origins: [] }, colorScheme: "light" }); // saved dark theme must win (Step 0)

  test(
    "P1-CAL-VIS-003 dark QA user stays dark under light preference and passes axe",
    {
      tag: ["@cal", "@visual", "@a11y"],
      annotation: { type: "testId", description: "P1-CAL-VIS-003" },
    },
    async ({ page, booker, darkThemeQaUser }, testInfo) => {
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      await page.goto(darkThemeQaUser.bookerPath, { waitUntil: "domcontentloaded" });
      await booker.expectLoaded();
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);
      await expect(page.getByTestId(CAL_TEST_IDS.bookerContainer)).toHaveCSS(
        "background-color",
        "rgb(23, 23, 23)",
      );
      const contrast = await axeScan(page, {
        project: testInfo.project.name,
        rules: ["color-contrast"],
        include: BOOKER_INCLUDE,
        allowlist: [],
      });
      expect(contrast.partition.blocking.map(describeViolation)).toEqual([]);
      const full = await axeScan(page, { project: testInfo.project.name, include: BOOKER_INCLUDE });
      await attachAxeReport(testInfo, "axe-booker-dark", full.report);
      expect(full.partition.blocking.map(describeViolation)).toEqual([]);
      expect(full.partition.staleAllowlist.map((e) => e.target)).toEqual([]);
      await stableScreenshot(page, "booker-dark", { mask: maskLocators(page, "cal") });
    },
  );

  test(
    "P1-CAL-VIS-003 light pro booker passes axe color-contrast",
    {
      tag: ["@cal", "@visual", "@a11y"],
      annotation: { type: "testId", description: "P1-CAL-VIS-003" },
    },
    async ({ page, booker }, testInfo) => {
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      await booker.gotoProThirtyMin();
      await booker.expectLoaded();
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);
      await expect(page.getByTestId(CAL_TEST_IDS.bookerContainer)).toHaveCSS(
        "background-color",
        "rgb(255, 255, 255)",
      );
      const contrast = await axeScan(page, {
        project: testInfo.project.name,
        rules: ["color-contrast"],
        include: BOOKER_INCLUDE,
        allowlist: [],
      });
      expect(contrast.partition.blocking.map(describeViolation)).toEqual([]);
    },
  );
});
