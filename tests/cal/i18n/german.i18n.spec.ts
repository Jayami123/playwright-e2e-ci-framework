import type { Locator } from "@playwright/test";
import { expect, test } from "../../../src/products/cal/fixtures.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import { CAL_FROZEN_SLOT_COUNT } from "../../../src/products/cal/visual.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { overflowingControls, type ScrollBox } from "../../../src/support/visual/layout.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";

interface ButtonEl {
  getAttribute(name: string): string | null;
  innerText: string;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}

function measure(buttons: Locator): Promise<ScrollBox[]> {
  return buttons.evaluateAll((els: readonly ButtonEl[]) =>
    els.map((el) => ({
      label: el.getAttribute("aria-label") ?? el.innerText,
      sw: el.scrollWidth,
      cw: el.clientWidth,
      sh: el.scrollHeight,
      ch: el.clientHeight,
    })),
  );
}

test.describe("Cal German locale", () => {
  test.use({ storageState: { cookies: [], origins: [] }, locale: "de-DE" }); // Accept-Language drives locale for anonymous visitors

  test(
    "P1-CAL-I18N-001 booker renders in German and matches the baseline",
    { tag: ["@cal", "@visual"], annotation: { type: "testId", description: "P1-CAL-I18N-001" } },
    async ({ page, booker }) => {
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      await booker.gotoProThirtyMin();
      await booker.expectLoaded();
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);
      expect(await page.evaluate<string>("document.documentElement.lang")).toBe("de");
      await expect(page.getByTestId(CAL_TEST_IDS.selectedMonthLabel)).toHaveText("Januar 2030");
      await expect(page.getByRole("button", { name: "Vormonat anzeigen" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Nächsten Monat anzeigen" })).toBeVisible();
      expect(
        await page.evaluate<number>("document.documentElement.scrollWidth"),
      ).toBeLessThanOrEqual(await page.evaluate<number>("document.documentElement.clientWidth"));
      await stableScreenshot(page, "booker-de", { mask: maskLocators(page, "cal") });
    },
  );

  test(
    "P1-CAL-I18N-002 German labels do not clip buttons on the booker or the form",
    { tag: ["@cal", "@visual"], annotation: { type: "testId", description: "P1-CAL-I18N-002" } },
    async ({ page, booker, bookingQaUser }) => {
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      await booker.gotoProThirtyMin();
      await booker.expectLoaded();
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);
      const bookerButtons = page.getByTestId(CAL_TEST_IDS.bookerContainer).getByRole("button");
      expect(overflowingControls(await measure(bookerButtons))).toEqual([]);

      // Form: a QA user's own event, never pro (a slot click reserves it for 5 minutes).
      await page.goto(bookingQaUser.bookerPath, { waitUntil: "domcontentloaded" });
      await booker.expectLoaded();
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);
      await booker.firstSlot().click();
      await expect(page.getByTestId(CAL_TEST_IDS.confirmBook)).toHaveText("Bestätigen");
      await expect(page.getByTestId(CAL_TEST_IDS.bookerBack)).toHaveText("Zurück");
      const formButtons = page.getByTestId(CAL_TEST_IDS.bookerContainer).getByRole("button");
      expect(overflowingControls(await measure(formButtons))).toEqual([]);
    },
  );
});
