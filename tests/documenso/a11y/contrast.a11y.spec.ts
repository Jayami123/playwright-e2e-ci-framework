import { DocumentsPage } from "../../../src/products/documenso/pages/documents.page.js";
import {
  DOC_VIS004_ALLOWLIST,
  DOCUMENSO_AXE_ALLOWLIST,
} from "../../../src/products/documenso/visual.js";
import { expect, test } from "../../../src/products/documenso/visual-fixtures.js";
import {
  attachAxeEvidence,
  attachAxeReport,
  AXE_WCAG_TAGS,
  axeScan,
  describeViolation,
} from "../../../src/support/visual/axe.js";

for (const scheme of ["light", "dark"] as const) {
  test.describe(`P1-DOC-VIS-004 ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test(
      `P1-DOC-VIS-004 /documents ${scheme} color-contrast`,
      {
        tag: ["@documenso", "@a11y"],
        annotation: { type: "testId", description: "P1-DOC-VIS-004" },
      },
      async ({ ownerPage, documensoUser }, testInfo) => {
        await new DocumentsPage(ownerPage).goto(documensoUser.teamUrl);
        // Step 0: html.light / html.dark
        await expect
          .poll(() => ownerPage.evaluate<string>("document.documentElement.className"))
          .toMatch(new RegExp(`\\b${scheme}\\b`));
        const scan = await axeScan(ownerPage, {
          project: testInfo.project.name,
          rules: ["color-contrast"],
          allowlist: DOC_VIS004_ALLOWLIST,
          context: scheme,
        });
        await attachAxeReport(testInfo, `axe-documents-${scheme}`, scan.report);
        await attachAxeEvidence(ownerPage, testInfo, `documents-${scheme}`, scan);
        expect(scan.partition.blocking.map(describeViolation)).toEqual([]);
        expect(scan.partition.staleAllowlist.map((e) => e.finding)).toEqual([]);
      },
    );
  });
}

test(
  "P1-DOC-VIS-X07 /documents full WCAG serious and critical findings are all recorded",
  { tag: ["@documenso", "@a11y"], annotation: { type: "testId", description: "P1-DOC-VIS-X07" } },
  async ({ ownerPage, documensoUser }, testInfo) => {
    await new DocumentsPage(ownerPage).goto(documensoUser.teamUrl);
    const scan = await axeScan(ownerPage, {
      project: testInfo.project.name,
      allowlist: DOCUMENSO_AXE_ALLOWLIST,
      context: "wcag",
    });
    expect(AXE_WCAG_TAGS.length).toBeGreaterThan(0);
    await attachAxeReport(testInfo, "axe-documents-wcag", scan.report);
    await attachAxeEvidence(ownerPage, testInfo, "documents-wcag", scan);
    expect(scan.partition.blocking.map(describeViolation)).toEqual([]);
    expect(scan.partition.staleAllowlist.map((e) => e.finding)).toEqual([]);
  },
);
