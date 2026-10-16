/* eslint-disable playwright/no-nth-methods -- Documenso renders desktop and mobile variants of the same control; the first visible match is the intended one */
import { expect, test } from "../../../src/products/documenso/visual-fixtures.js";
import { SigningPage } from "../../../src/products/documenso/pages/signing.page.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";

test(
  "P1-DOC-VIS-001 pending signing page baseline",
  { tag: ["@documenso", "@visual"], annotation: { type: "testId", description: "P1-DOC-VIS-001" } },
  async ({ page, pendingEnvelope }) => {
    await freezeClock(page, VISUAL_FROZEN_INSTANT);
    const signing = new SigningPage(page);
    await signing.gotoAndWaitForPdf(pendingEnvelope.signPath);
    await expect(page.getByRole("heading", { name: /^Sign Document/ })).toBeVisible();
    await expect(signing.nextFieldButton().filter({ visible: true })).toBeVisible();
    // Collapsed into the widget below desktop width, so attached rather than visible.
    await expect(page.getByText(/1 Field Remaining/).first()).toBeAttached();
    await stableScreenshot(page, "doc-signing-pending", { mask: maskLocators(page, "documenso") });
  },
);
