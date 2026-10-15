import { expect, test } from "../../../src/products/cal/fixtures.js";
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import {
  A11Y006_DOLLAR_NAME_ISSUE,
  CAL_FROZEN_SLOT_COUNT,
} from "../../../src/products/cal/visual.js";
import { attachAxeReport, axeScan, describeViolation } from "../../../src/support/visual/axe.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";

const NAME_RULES = [
  "button-name",
  "link-name",
  "label",
  "aria-toggle-field-name",
  "aria-input-field-name",
  "select-name",
  "input-button-name",
  "aria-command-name",
] as const;

interface NamedEl {
  getAttribute(name: string): string | null;
  textContent: string | null;
}

test.describe("Cal accessible names", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "P1-CAL-A11Y-006 controls have accessible names without a literal $ prefix",
    { tag: ["@cal", "@a11y"], annotation: { type: "testId", description: "P1-CAL-A11Y-006" } },
    async ({ page, booker }, testInfo) => {
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      await booker.gotoProThirtyMin();
      await booker.expectLoaded();
      await expect(booker.slotButtons()).toHaveCount(CAL_FROZEN_SLOT_COUNT);
      const scan = await axeScan(page, {
        project: testInfo.project.name,
        rules: [...NAME_RULES],
        include: [`[data-testid="${CAL_TEST_IDS.bookerContainer}"]`],
      });
      await attachAxeReport(testInfo, "axe-booker-names", scan.report);
      expect(scan.partition.blocking.map(describeViolation)).toEqual([]);
      expect(scan.partition.staleAllowlist.map((e) => e.target)).toEqual([]); // overlay entry must match on tablet/desktop

      // "$" prefix: Step 0 found 3 view-toggle radios on tablet/desktop; mobile renders only 12h/24h.
      const hasViewToggles = testInfo.project.name !== "visual-mobile";
      // Hard precondition, so the bug check can't pass vacuously: 5 radios (3 toggles + 12h/24h) or 2 on mobile.
      await expect(page.getByRole("radio")).toHaveCount(hasViewToggles ? 5 : 2);
      const dollar = await page.getByRole("radio", { name: /^\$/ }).count();
      await attachKnownBugEvidence(page, testInfo, {
        issue: A11Y006_DOLLAR_NAME_ISSUE,
        observed: {
          dollarPrefixedRadios: dollar,
          names: await page
            .getByRole("radio")
            .evaluateAll((els: readonly NamedEl[]) =>
              els.map((e) => e.getAttribute("aria-label") ?? e.textContent ?? ""),
            ),
        },
        expected: { dollarPrefixedRadios: 0 },
      });
      test.fail(hasViewToggles, A11Y006_DOLLAR_NAME_ISSUE); // condition form: no `if` in the test body
      expect(dollar, 'accessible names must not start with a literal "$"').toBe(0);
    },
  );
});
