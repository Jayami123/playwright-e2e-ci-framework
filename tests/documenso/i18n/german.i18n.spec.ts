import { expect, test } from "../../../src/products/documenso/visual-fixtures.js";
import { SigningPage } from "../../../src/products/documenso/pages/signing.page.js";
import { documentScroll } from "../../../src/support/visual/dom.js";
import { rectInsideWidth } from "../../../src/support/visual/layout.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";

test.describe("Documenso German locale", () => {
  test.use({ locale: "de-DE" }); // Accept-Language reaches the server (Step 0)

  test(
    "P1-DOC-VIS-002 signing page renders in German inside the mobile viewport",
    {
      tag: ["@documenso", "@visual"],
      annotation: { type: "testId", description: "P1-DOC-VIS-002" },
    },
    async ({ page, pendingEnvelope }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-mobile"]);
      await pendingEnvelope.signField();
      const signing = new SigningPage(page);
      await signing.gotoAndWaitForPdf(pendingEnvelope.signPath);

      expect(await page.evaluate<string>("document.documentElement.lang")).toBe("de");
      await expect(page.getByRole("heading", { name: /^Dokument signieren/ })).toBeVisible();
      const complete = signing.visibleCompleteButton("Abschließen");
      await expect(complete).toBeVisible();
      const box = await complete.boundingBox();
      if (box === null) {
        throw new Error("Abschließen has no bounding box");
      }
      expect(rectInsideWidth(box, 393)).toBe(true);
      expect(box.y + box.height).toBeLessThanOrEqual(852);
      const { scrollWidth, clientWidth } = await documentScroll(page);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    },
  );
});
