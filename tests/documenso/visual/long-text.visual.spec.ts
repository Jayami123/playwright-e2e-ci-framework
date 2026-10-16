import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { DocumentsPage } from "../../../src/products/documenso/pages/documents.page.js";
import { SigningPage } from "../../../src/products/documenso/pages/signing.page.js";
import {
  DOC_LONG_RECIPIENT_NAME,
  DOC_LONG_TITLE,
  DOC_X01_LONG_TITLE_OVERFLOW_ISSUE,
} from "../../../src/products/documenso/visual.js";
import { expect, test } from "../../../src/products/documenso/visual-fixtures.js";
import {
  boundingBoxOf,
  computedStyleOf,
  documentScroll,
  scrollSizeOf,
} from "../../../src/support/visual/dom.js";
import { rectInsideWidth, rectsOverlap } from "../../../src/support/visual/layout.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";

test.describe("Documenso long text", () => {
  test.use({ envelopeText: { title: DOC_LONG_TITLE, recipientName: DOC_LONG_RECIPIENT_NAME } });

  test(
    "P1-DOC-VIS-003 a 200-char title and 80-char name stay inside the mobile viewport",
    {
      tag: ["@documenso", "@visual"],
      annotation: { type: "testId", description: "P1-DOC-VIS-003" },
    },
    async ({ page, ownerPage, documensoUser, pendingEnvelope }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-mobile"]);

      // List: the title link truncates with an ellipsis, keeps the full title, and clears the row action.
      const documents = new DocumentsPage(ownerPage);
      await documents.goto(documensoUser.teamUrl);
      const link = documents.titleLink(DOC_LONG_TITLE);
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("title", DOC_LONG_TITLE);
      await expect.poll(() => computedStyleOf(link, "textOverflow")).toBe("ellipsis");
      const linkSize = await scrollSizeOf(link);
      expect(linkSize.scrollWidth).toBeGreaterThan(linkSize.clientWidth);
      const action = ownerPage
        .getByRole("row")
        .filter({ has: link })
        .getByTestId("document-table-action-btn");
      await expect(action).toBeVisible();
      expect(
        rectsOverlap(
          await boundingBoxOf("title link", link),
          await boundingBoxOf("row action", action),
        ),
      ).toBe(false);
      const listScroll = await documentScroll(ownerPage);
      expect(listScroll.scrollWidth).toBeLessThanOrEqual(listScroll.clientWidth + 1);

      // Signing: the header truncates, "Actions" is not overlapped, the long name fits its textbox.
      const signing = new SigningPage(page);
      await signing.gotoAndWaitForPdf(pendingEnvelope.signPath);
      const header = signing.headerTitle();
      await expect(header).toHaveAttribute("title", DOC_LONG_TITLE);
      await expect.poll(() => computedStyleOf(header, "textOverflow")).toBe("ellipsis");
      const actions = page.getByRole("button", { name: "Actions" });
      expect(
        rectsOverlap(
          await boundingBoxOf("header title", header),
          await boundingBoxOf("Actions", actions),
        ),
      ).toBe(false);
      await signing.expandMobileWidget();
      const nameInput = signing.fullNameInput();
      await expect(nameInput).toHaveValue(DOC_LONG_RECIPIENT_NAME);
      expect(rectInsideWidth(await boundingBoxOf("Full Name", nameInput), 393)).toBe(true);
    },
  );

  test(
    "P1-DOC-VIS-X01 a 200-char title does not overflow the page at tablet and desktop",
    {
      tag: ["@documenso", "@visual"],
      annotation: { type: "testId", description: "P1-DOC-VIS-X01" },
    },
    async ({ page, pendingEnvelope }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-tablet", "visual-desktop"]);
      const signing = new SigningPage(page);
      await signing.gotoAndWaitForPdf(pendingEnvelope.signPath);
      // Precondition (hard): the visible header carries the full title.
      await expect(signing.headerTitle()).toHaveText(DOC_LONG_TITLE);
      const primary =
        testInfo.project.name === "visual-desktop"
          ? signing.nextFieldButton().filter({ visible: true })
          : page.getByRole("button", { name: "Actions" });
      const primaryBox = await boundingBoxOf("primary action", primary);
      const { scrollWidth, clientWidth } = await documentScroll(page);
      await attachKnownBugEvidence(page, testInfo, {
        issue: DOC_X01_LONG_TITLE_OVERFLOW_ISSUE,
        observed: { scrollWidth, clientWidth, primaryActionRight: primaryBox.x + primaryBox.width },
        expected: { scrollWidthMax: clientWidth + 1 },
      });
      test.fail(true, DOC_X01_LONG_TITLE_OVERFLOW_ISSUE);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    },
  );
});
