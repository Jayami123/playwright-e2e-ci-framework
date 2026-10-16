/* eslint-disable playwright/no-nth-methods -- Twenty renders virtualised rows and duplicate chips/toasts; the first visible match is the intended one */
import { twentyTimeouts } from "../../../src/products/twenty/env.js";
import type { Page } from "@playwright/test";
import { TwentyPeoplePage } from "../../../src/products/twenty/pages/people.page.js";
import { TwentyRecordPage } from "../../../src/products/twenty/pages/record.page.js";
import {
  findingId,
  attachAxeEvidence,
  attachAxeReport,
  axeScan,
  describeViolation,
} from "../../../src/support/visual/axe.js";
import type {
  AxeAllowlistEntry,
  AxeScanOptions,
  AxeScanResult,
} from "../../../src/support/visual/axe.js";
import {
  TW_BACKGROUND,
  TW_PEOPLE_FINDINGS,
  TW_PERSON_FINDINGS,
  TW_PERSON_ID,
  TW_PERSON_NAME,
  TWENTY_AXE_ALLOWLIST,
} from "../../../src/products/twenty/visual.js";
import { expect, test } from "../../../src/products/twenty/visual-fixtures.js";

/** The record page shows "Untitled" and skeletons first; scan only once the name and sidebar are in. */
async function waitForRecordLoaded(page: Page, project: string): Promise<void> {
  await expect(page.getByTestId("top-bar-title")).toContainText(TW_PERSON_NAME, {
    timeout: twentyTimeouts().page,
  });
  if (project !== "visual-mobile") {
    // The sidebar is collapsed at mobile width (Step 0: no "Workspace" label there).
    await expect(page.getByText("Workspace", { exact: true }).first()).toBeVisible();
  }
}

/**
 * axe occasionally misses a node that is mid-transition (an allowlisted sidebar label was reported
 * stale in 3 of 12 scans). A genuinely stale entry stays stale, so re-scan before judging.
 */
async function scanSettled(page: Page, opts: AxeScanOptions): Promise<AxeScanResult> {
  let scan = await axeScan(page, opts);
  for (let attempt = 1; attempt < 3 && scan.partition.staleAllowlist.length > 0; attempt += 1) {
    scan = await axeScan(page, opts);
  }
  return scan;
}

/** Per-page lists so an entry for the other page is never reported stale. */
function forFindings(findings: ReadonlySet<string>): readonly AxeAllowlistEntry[] {
  return TWENTY_AXE_ALLOWLIST.filter((e) => findings.has(findingId(e.finding)));
}

for (const scheme of ["Light", "Dark"] as const) {
  test.describe(`P1-TW-VIS-001 ${scheme}`, () => {
    // The emulation is deliberately the opposite: it proves the member setting wins (Step 0).
    test.use({
      memberPrefs: { colorScheme: scheme },
      colorScheme: scheme === "Dark" ? "light" : "dark",
    });

    test(
      `P1-TW-VIS-001 People and person record ${scheme} color-contrast`,
      {
        tag: ["@twenty", "@a11y"],
        annotation: { type: "testId", description: "P1-TW-VIS-001" },
      },
      async ({ page }, testInfo) => {
        test.setTimeout(180_000); // two page loads plus two axe scans on a 60-row table
        const context = scheme.toLowerCase();
        const people = new TwentyPeoplePage(page);
        await people.goto();
        await expect(people.rows().first()).toBeVisible({ timeout: twentyTimeouts().page });
        // eslint-disable-next-line playwright/no-raw-locators -- the body has no role or test id
        await expect(page.locator("body")).toHaveCSS("background-color", TW_BACKGROUND[scheme]);
        const peopleScan = await scanSettled(page, {
          project: testInfo.project.name,
          rules: ["color-contrast"],
          allowlist: forFindings(TW_PEOPLE_FINDINGS),
          context,
        });
        await attachAxeReport(testInfo, `axe-people-${context}`, peopleScan.report);
        await attachAxeEvidence(page, testInfo, `people-${context}`, peopleScan);
        expect(peopleScan.partition.blocking.map(describeViolation)).toEqual([]);
        expect(peopleScan.partition.staleAllowlist.map((e) => e.finding)).toEqual([]);

        const record = new TwentyRecordPage(page);
        await record.goto("person", TW_PERSON_ID);
        await expect(record.fieldsWidget).toBeVisible({ timeout: twentyTimeouts().page });
        await waitForRecordLoaded(page, testInfo.project.name);
        const personScan = await scanSettled(page, {
          project: testInfo.project.name,
          rules: ["color-contrast"],
          allowlist: forFindings(TW_PERSON_FINDINGS),
          context,
        });
        await attachAxeReport(testInfo, `axe-person-${context}`, personScan.report);
        await attachAxeEvidence(page, testInfo, `person-${context}`, personScan);
        expect(personScan.partition.blocking.map(describeViolation)).toEqual([]);
        expect(personScan.partition.staleAllowlist.map((e) => e.finding)).toEqual([]);
      },
    );
  });
}

test.describe("P1-TW-VIS-X06 full WCAG", () => {
  test.use({ memberPrefs: { colorScheme: "Light" }, colorScheme: "dark" });

  test(
    "P1-TW-VIS-X06 People and person record full WCAG findings are all recorded",
    { tag: ["@twenty", "@a11y"], annotation: { type: "testId", description: "P1-TW-VIS-X06" } },
    async ({ page }, testInfo) => {
      test.setTimeout(180_000); // two page loads plus two full-WCAG scans
      const people = new TwentyPeoplePage(page);
      await people.goto();
      await expect(people.rows().first()).toBeVisible({ timeout: twentyTimeouts().page });
      const peopleScan = await scanSettled(page, {
        project: testInfo.project.name,
        allowlist: forFindings(TW_PEOPLE_FINDINGS),
        context: "wcag",
      });
      await attachAxeReport(testInfo, "axe-people-wcag", peopleScan.report);
      await attachAxeEvidence(page, testInfo, "people-wcag", peopleScan);

      const record = new TwentyRecordPage(page);
      await record.goto("person", TW_PERSON_ID);
      await expect(record.fieldsWidget).toBeVisible({ timeout: twentyTimeouts().page });
      await waitForRecordLoaded(page, testInfo.project.name);
      const personScan = await scanSettled(page, {
        project: testInfo.project.name,
        allowlist: forFindings(TW_PERSON_FINDINGS),
        context: "wcag",
      });
      await attachAxeReport(testInfo, "axe-person-wcag", personScan.report);
      await attachAxeEvidence(page, testInfo, "person-wcag", personScan);

      expect(peopleScan.partition.blocking.map(describeViolation)).toEqual([]);
      expect(personScan.partition.blocking.map(describeViolation)).toEqual([]);
      expect(peopleScan.partition.staleAllowlist.map((e) => e.finding)).toEqual([]);
      expect(personScan.partition.staleAllowlist.map((e) => e.finding)).toEqual([]);
    },
  );
});
