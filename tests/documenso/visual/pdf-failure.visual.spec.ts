/* eslint-disable playwright/no-nth-methods -- Documenso renders desktop and mobile variants of the same control; the first visible match is the intended one */
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { SigningPage } from "../../../src/products/documenso/pages/signing.page.js";
import {
  DOC_PDF_ERROR_TEXT,
  DOC_PDF_ROUTE,
  DOC_PDF_TOAST_TEXT,
  DOC_X03_PDF_STALL_ISSUE,
} from "../../../src/products/documenso/visual.js";
import { expect, test } from "../../../src/products/documenso/visual-fixtures.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";

test(
  "P1-DOC-VIS-005 a PDF HTTP 500 shows the document error state and a toast",
  { tag: ["@documenso", "@visual"], annotation: { type: "testId", description: "P1-DOC-VIS-005" } },
  async ({ page, pendingEnvelope }, testInfo) => {
    onlyOnProjects(testInfo.project.name, ["visual-desktop", "visual-mobile"]);
    const signing = new SigningPage(page);
    let hits = 0;
    await page.route(DOC_PDF_ROUTE, async (route) => {
      hits += 1;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: '{"error":"P1 mocked failure"}',
      });
    });
    await page.goto(pendingEnvelope.signPath, { waitUntil: "domcontentloaded" });
    await expect.poll(() => hits, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByText(DOC_PDF_ERROR_TEXT)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(DOC_PDF_TOAST_TEXT, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(signing.pdfCanvas()).toHaveCount(0);
  },
);

test(
  "P1-DOC-VIS-X02 an aborted PDF request shows the document error state and a toast",
  {
    tag: ["@documenso", "@visual"],
    annotation: { type: "testId", description: "P1-DOC-VIS-X02" },
  },
  async ({ page, pendingEnvelope }, testInfo) => {
    onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
    const signing = new SigningPage(page);
    let hits = 0;
    await page.route(DOC_PDF_ROUTE, async (route) => {
      hits += 1;
      await route.abort("failed");
    });
    await page.goto(pendingEnvelope.signPath, { waitUntil: "domcontentloaded" });
    await expect.poll(() => hits, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByText(DOC_PDF_ERROR_TEXT)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(DOC_PDF_TOAST_TEXT, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(signing.pdfCanvas()).toHaveCount(0);
  },
);

test(
  "P1-DOC-VIS-X03 a stalled PDF request ends in an error or timeout message",
  {
    tag: ["@documenso", "@visual"],
    annotation: { type: "testId", description: "P1-DOC-VIS-X03" },
  },
  async ({ page, pendingEnvelope }, testInfo) => {
    onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
    test.setTimeout(60_000); // 30 s observation + ~10 s setup + 5 s final assert; never longer
    let hits = 0;
    await page.route(DOC_PDF_ROUTE, () => {
      hits += 1;
      return new Promise<void>(() => {});
    }); // never answers
    await page.goto(pendingEnvelope.signPath, { waitUntil: "domcontentloaded" });
    // eslint-disable-next-line playwright/no-raw-locators -- Documenso Spinner has no role (pdf-viewer-states.tsx)
    const spinner = page.locator(".animate-spin");
    const errorText = page.getByText(DOC_PDF_ERROR_TEXT);
    await expect.poll(() => hits, { timeout: 10_000 }).toBeGreaterThan(0); // precondition: route matched
    await expect(spinner.first()).toBeVisible(); // precondition: loading state shown
    const t0 = Date.now();
    // One 30 s observation window, polled every 5 s (no waitForTimeout): still spinning, no message.
    await expect
      .poll(
        async () =>
          Date.now() - t0 >= 30_000
            ? "done"
            : (await errorText.count()) === 0
              ? "waiting"
              : "error",
        { timeout: 32_000, intervals: [5_000] },
      )
      .toBe("done");
    await attachKnownBugEvidence(page, testInfo, {
      issue: DOC_X03_PDF_STALL_ISSUE,
      observed: {
        hits,
        waitedMs: Date.now() - t0,
        spinner: await spinner.count(),
        errorText: await errorText.count(),
      },
      expected: { spinner: 0, errorOrTimeoutMessage: 1 },
    });
    test.fail(true, DOC_X03_PDF_STALL_ISSUE);
    await expect(errorText.or(page.getByText(/timed? ?out|try again/i)).first()).toBeVisible({
      timeout: 5_000,
    });
  },
);
