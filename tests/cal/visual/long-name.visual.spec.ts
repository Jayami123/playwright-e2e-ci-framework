import type { Locator } from "@playwright/test";
import { expect, test } from "../../../src/products/cal/fixtures.js";
import { LONG_NAME, LONG_TITLE } from "../../../src/products/cal/booker-qa.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import { CAL_FROZEN_SLOT_COUNT } from "../../../src/products/cal/visual.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import {
  overflowingControls,
  rectInsideWidth,
  rectsOverlap,
  type Rect,
} from "../../../src/support/visual/layout.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";

interface ScrollEl {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}

async function boxOf(label: string, locator: Locator): Promise<Rect> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error(`${label} has no bounding box`);
  }
  return box;
}

test.describe("Cal long name and title", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "P1-CAL-VIS-002 80-char name and 120-char title wrap cleanly at 393x852",
    { tag: ["@cal", "@visual"], annotation: { type: "testId", description: "P1-CAL-VIS-002" } },
    async ({ page, booker, longNameQaUser }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-mobile"]);
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      await page.goto(longNameQaUser.bookerPath, { waitUntil: "domcontentloaded" });
      await booker.expectLoaded();
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);

      const meta = page.getByTestId(CAL_TEST_IDS.eventMeta);
      const name = meta.getByText(LONG_NAME, { exact: true });
      const title = page.getByTestId(CAL_TEST_IDS.eventTitle);
      await expect(name).toBeVisible();
      await expect(title).toHaveText(LONG_TITLE);
      const width = await page.evaluate<number>("document.documentElement.clientWidth");
      expect(
        await page.evaluate<number>("document.documentElement.scrollWidth"),
      ).toBeLessThanOrEqual(width);

      const boxes = {
        avatar: await boxOf("avatar", page.getByTestId(CAL_TEST_IDS.avatar)),
        name: await boxOf("name", name),
        title: await boxOf("title", title),
        timezone: await boxOf("timezone", page.getByTestId(CAL_TEST_IDS.currentTimezone)),
        prev: await boxOf("decrementMonth", page.getByTestId(CAL_TEST_IDS.decrementMonth)),
        next: await boxOf("incrementMonth", page.getByTestId(CAL_TEST_IDS.incrementMonth)),
      };
      for (const r of [boxes.name, boxes.title]) {
        expect(rectInsideWidth(r, width)).toBe(true);
      }
      expect(rectsOverlap(boxes.avatar, boxes.name)).toBe(false);
      expect(rectsOverlap(boxes.name, boxes.title)).toBe(false);
      expect(rectsOverlap(boxes.title, boxes.timezone)).toBe(false);
      for (const b of [boxes.prev, boxes.next]) {
        expect(rectsOverlap(boxes.title, b)).toBe(false);
      }

      // Wrap, not clip: scroll sizes fit (Step 0: clip text-overflow, normal white-space)
      const scroll = await title.evaluate((el: ScrollEl) => ({
        label: "title",
        sw: el.scrollWidth,
        cw: el.clientWidth,
        sh: el.scrollHeight,
        ch: el.clientHeight,
      }));
      expect(overflowingControls([scroll])).toEqual([]);
      await stableScreenshot(page, "booker-long-name", { mask: maskLocators(page, "cal") });

      // Collision: same display-name prefix must not hijack /pro (clock stays frozen)
      await booker.gotoProThirtyMin();
      await booker.expectLoaded();
      await expect(page.getByTestId(CAL_TEST_IDS.eventTitle)).toHaveText("30min");
      await expect(
        page.getByTestId(CAL_TEST_IDS.eventMeta).getByText("Pro Example", { exact: true }),
      ).toBeVisible();
    },
  );
});
