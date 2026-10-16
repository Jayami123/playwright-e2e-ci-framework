import { twentyTimeouts } from "../../../src/products/twenty/env.js";
import { TwentyRecordPage } from "../../../src/products/twenty/pages/record.page.js";
import { TW_PERSON_ID, TW_PERSON_NAME } from "../../../src/products/twenty/visual.js";
import { expect, test } from "../../../src/products/twenty/visual-fixtures.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";

test(
  "P1-TW-VIS-003 person record baseline",
  { tag: ["@twenty", "@visual"], annotation: { type: "testId", description: "P1-TW-VIS-003" } },
  async ({ page }) => {
    await freezeClock(page, VISUAL_FROZEN_INSTANT);
    const record = new TwentyRecordPage(page);
    await record.goto("person", TW_PERSON_ID);
    await expect(record.fieldsWidget).toBeVisible({ timeout: twentyTimeouts().page });
    await expect(page.getByTestId("top-bar-title")).toContainText(TW_PERSON_NAME, {
      timeout: twentyTimeouts().page,
    });
    await stableScreenshot(page, "tw-person-record", {
      mask: maskLocators(page, "twenty"),
      networkIdle: false,
    });
  },
);
