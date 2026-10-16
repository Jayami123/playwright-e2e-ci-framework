import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { SigningPage } from "../../../src/products/documenso/pages/signing.page.js";
import { DOC_X04_ZOOM_COMPLETE_ISSUE } from "../../../src/products/documenso/visual.js";
import { expect, test } from "../../../src/products/documenso/visual-fixtures.js";
import {
  boundingBoxOf,
  computedStyleOf,
  containsActiveElement,
  documentScroll,
} from "../../../src/support/visual/dom.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";

test.describe("Documenso 200% zoom", () => {
  test.use({ viewport: { width: 197, height: 426 }, deviceScaleFactor: 2 });

  test(
    "P1-DOC-VIS-X04 Complete stays inside the viewport at 200% zoom",
    { tag: ["@documenso", "@a11y"], annotation: { type: "testId", description: "P1-DOC-VIS-X04" } },
    async ({ page, pendingEnvelope }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-mobile"]);
      await pendingEnvelope.signField();
      const signing = new SigningPage(page);
      await signing.gotoAndWaitForPdf(pendingEnvelope.signPath);
      const complete = signing.visibleCompleteButton();
      // Precondition (hard): Complete is visible and the page itself does not scroll.
      await expect(complete).toBeVisible();
      const { scrollWidth } = await documentScroll(page);
      expect(scrollWidth).toBeLessThanOrEqual(198);
      const box = await boundingBoxOf("Complete", complete);
      await attachKnownBugEvidence(page, testInfo, {
        issue: DOC_X04_ZOOM_COMPLETE_ISSUE,
        observed: { boxRight: box.x + box.width, viewport: 197 },
        expected: { boxRightMax: 198 },
      });
      test.fail(true, DOC_X04_ZOOM_COMPLETE_ISSUE);
      expect(box.x + box.width).toBeLessThanOrEqual(197 + 1);
    },
  );
});

test(
  "P1-DOC-VIS-X05 Complete is reachable by keyboard and opens the confirmation dialog",
  { tag: ["@documenso", "@a11y"], annotation: { type: "testId", description: "P1-DOC-VIS-X05" } },
  async ({ page, pendingEnvelope }, testInfo) => {
    onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
    await pendingEnvelope.signField();
    const signing = new SigningPage(page);
    await signing.gotoAndWaitForPdf(pendingEnvelope.signPath);
    const complete = signing.visibleCompleteButton();
    await expect(complete).toBeVisible();
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press("Tab");
      if (await containsActiveElement(complete)) {
        break;
      }
    }
    await expect(complete).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Are you sure?" })).toBeVisible();
    // Never click "Sign": completing the document changes the envelope state (FW suite covers it).
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  },
);

test.describe("Documenso forced colors", () => {
  test.use({ forcedColors: "active" });

  test(
    "P1-DOC-VIS-X06 Complete keeps a visible border in forced-colors mode",
    { tag: ["@documenso", "@a11y"], annotation: { type: "testId", description: "P1-DOC-VIS-X06" } },
    async ({ page, pendingEnvelope }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      await pendingEnvelope.signField();
      const signing = new SigningPage(page);
      await signing.gotoAndWaitForPdf(pendingEnvelope.signPath);
      expect(await page.evaluate<boolean>("matchMedia('(forced-colors: active)').matches")).toBe(
        true,
      );
      const complete = signing.visibleCompleteButton();
      await expect(complete).toBeVisible();
      expect(await computedStyleOf(complete, "borderTopStyle")).toBe("solid");
    },
  );
});
