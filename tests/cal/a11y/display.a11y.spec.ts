import type { Locator } from "@playwright/test";
import { expect, test } from "../../../src/products/cal/fixtures.js";
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import {
  A11Y003_WEEKDAY_OVERLAP_ISSUE,
  CAL_FROZEN_SLOT_COUNT,
} from "../../../src/products/cal/visual.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import {
  overlappingNeighbours,
  rectInsideWidth,
  type Rect,
  type TextSpan,
} from "../../../src/support/visual/layout.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";

interface DayEl {
  disabled: boolean;
  getBoundingClientRect(): Rect;
}

interface StyleDoc {
  getComputedStyle(el: unknown): {
    borderTopStyle: string;
    borderTopColor: string;
    backgroundColor: string;
  };
}

/** Weekday header labels: the parent whose seven leaf children are Sun..Sat, in DOM order. */
const WEEKDAY_SPANS = `(() => {
  const root = document.querySelector('[data-testid="booker-container"]');
  const names = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  for (const parent of root.querySelectorAll("*")) {
    const kids = [...parent.children];
    const ok = kids.length === 7 && kids.every((k, i) => k.children.length === 0 && (k.textContent || "").trim().toLowerCase() === names[i]);
    if (!ok) continue;
    return kids.map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const t = range.getBoundingClientRect();
      const c = el.getBoundingClientRect();
      return { label: (el.textContent || "").trim(), cellLeft: c.left, cellRight: c.right, textLeft: t.left, textRight: t.right };
    });
  }
  return [];
})()`;

async function openFrozenBooker(
  page: Parameters<typeof freezeClock>[0],
  booker: {
    gotoProThirtyMin(): Promise<void>;
    expectLoaded(): Promise<void>;
    slotButtons(): Locator;
  },
): Promise<void> {
  await freezeClock(page, VISUAL_FROZEN_INSTANT);
  await booker.gotoProThirtyMin();
  await booker.expectLoaded();
  await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);
}

test.describe("Cal 200% zoom", () => {
  test.use({
    storageState: { cookies: [], origins: [] },
    viewport: { width: 197, height: 426 },
    deviceScaleFactor: 2,
  }); // 200% zoom of 393x852

  test(
    "P1-CAL-A11Y-003 content reflows at 200% zoom without horizontal scroll",
    { tag: ["@cal", "@a11y"], annotation: { type: "testId", description: "P1-CAL-A11Y-003" } },
    async ({ page, booker }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-mobile"]);
      await openFrozenBooker(page, booker);
      const width = await page.evaluate<number>("document.documentElement.clientWidth");
      expect(
        await page.evaluate<number>("document.documentElement.scrollWidth"),
      ).toBeLessThanOrEqual(width);
      const days = await page
        .getByTestId(CAL_TEST_IDS.day)
        .evaluateAll((els: readonly DayEl[]) =>
          els.filter((e) => !e.disabled).map((e) => e.getBoundingClientRect()),
        );
      expect(days.length).toBeGreaterThan(0);
      for (const day of days) {
        expect(rectInsideWidth(day, width), "enabled day inside the viewport width").toBe(true);
      }
      // Collected before any day click: choosing a day adds a "Tue"-style span to the slot header.
      const spans = await page.evaluate<TextSpan[]>(WEEKDAY_SPANS);
      // Day click does not reserve anything; slot click would.
      await page.getByTestId(CAL_TEST_IDS.day).filter({ hasText: /^15/ }).click();
      const firstSlot = booker.firstSlot();
      await firstSlot.scrollIntoViewIfNeeded();
      const slotBox = await firstSlot.boundingBox();
      if (slotBox === null) {
        throw new Error("first slot has no bounding box");
      }
      expect(rectInsideWidth(slotBox, width), "first slot inside the viewport width").toBe(true);

      expect(spans, "weekday header spans (Sun-Sat) were not found").toHaveLength(7);
      await attachKnownBugEvidence(page, testInfo, {
        issue: A11Y003_WEEKDAY_OVERLAP_ISSUE,
        observed: {
          overlapping: overlappingNeighbours(spans),
          spans: spans.map((s) => ({ ...s })),
        },
        expected: { overlapping: [] },
      });
      test.fail(true, A11Y003_WEEKDAY_OVERLAP_ISSUE);
      expect(overlappingNeighbours(spans)).toEqual([]);
    },
  );
});

test.describe("Cal forced colors", () => {
  test.use({ storageState: { cookies: [], origins: [] }, forcedColors: "active" });

  test(
    "P1-CAL-A11Y-004 controls stay visible under forced colors",
    { tag: ["@cal", "@a11y"], annotation: { type: "testId", description: "P1-CAL-A11Y-004" } },
    async ({ page, booker }, testInfo) => {
      await openFrozenBooker(page, booker);
      expect(await page.evaluate<boolean>("matchMedia('(forced-colors: active)').matches")).toBe(
        true,
      );
      const hasSwitch = testInfo.project.name !== "visual-mobile";
      const controls: { label: string; locator: Locator }[] = [
        { label: "first slot", locator: booker.firstSlot() },
        {
          label: "first enabled day",
          locator: page.getByTestId(CAL_TEST_IDS.day).filter({ hasText: /^14/ }),
        },
        { label: "incrementMonth", locator: page.getByTestId(CAL_TEST_IDS.incrementMonth) },
        ...(hasSwitch
          ? [
              {
                label: "overlay switch",
                locator: page.getByTestId(CAL_TEST_IDS.overlayCalendarSwitch),
              },
            ]
          : []),
      ];
      for (const { label, locator } of controls) {
        await expect(locator, `${label} border style`).toHaveCSS("border-top-style", "solid");
        const style = await locator.evaluate((el: unknown) => {
          const css = (
            globalThis as unknown as {
              document: unknown;
              getComputedStyle: StyleDoc["getComputedStyle"];
            }
          ).getComputedStyle(el);
          return { border: css.borderTopColor, background: css.backgroundColor };
        });
        expect(style.border, `${label} border colour differs from its background`).not.toBe(
          style.background,
        );
      }
    },
  );
});

test.describe("Cal reduced motion", () => {
  test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: "reduce" });

  test(
    "P1-CAL-A11Y-005 no infinite animations and information is static under reduced motion",
    { tag: ["@cal", "@a11y"], annotation: { type: "testId", description: "P1-CAL-A11Y-005" } },
    async ({ page, booker }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      await openFrozenBooker(page, booker);
      expect(
        await page.evaluate<boolean>("matchMedia('(prefers-reduced-motion: reduce)').matches"),
      ).toBe(true);
      await page.evaluate(
        "Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)))",
      );
      expect(
        await page.evaluate<number>(
          "document.getAnimations().filter((a) => a.effect.getTiming().iterations === Infinity).length",
        ),
      ).toBe(0);
      await expect(page.getByTestId(CAL_TEST_IDS.selectedMonthLabel)).toHaveText("January 2030");
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);
      await expect(page.getByText(/^Mon\s*14$/)).toBeVisible();
    },
  );
});
