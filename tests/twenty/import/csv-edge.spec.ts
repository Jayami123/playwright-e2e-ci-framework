import type { Page } from "@playwright/test";
import { stat } from "node:fs/promises";
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { buildPeopleCsv, peopleCsvEmail } from "../../../src/products/twenty/csv.js";
import { twentyTimeouts } from "../../../src/products/twenty/env.js";
import { TW_CSV_X07_SUBMIT_HIDDEN_ISSUE } from "../../../src/products/twenty/issues.js";
import {
  countPeople,
  createPersonWithEmail,
  emailEqFilter,
  listPeople,
} from "../../../src/products/twenty/fixtures/people-bulk.js";
import { expect, test } from "../../../src/products/twenty/import-fixtures.js";
import { TwentyImportWizardPage } from "../../../src/products/twenty/pages/import-wizard.page.js";
import { TwentyPeoplePage } from "../../../src/products/twenty/pages/people.page.js";

/** Open, upload, map Emails, validate and confirm a clean file on the given page. */
async function importClean(page: Page, filePath: string): Promise<void> {
  const people = new TwentyPeoplePage(page);
  const wizard = new TwentyImportWizardPage(page);
  await people.goto();
  await wizard.open();
  await wizard.upload(filePath);
  await wizard.mapEmailsToPrimaryEmail();
  await wizard.nextStep();
  await wizard.confirm();
  await wizard.expectClosed();
}

function annotations(id: string, priority: string): { type: string; description: string }[] {
  return [
    { type: "testId", description: id },
    { type: "priority", description: priority },
  ];
}

test.describe("Twenty CSV import edge cases", { tag: ["@twenty", "@csv"] }, () => {
  test(
    "P1-TW-CSV-X01 Importing an existing email updates that person (upsert)",
    { annotation: annotations("P1-TW-CSV-X01", "P2") },
    async ({ page, twentyCsv }) => {
      const people = new TwentyPeoplePage(page);
      const email = peopleCsvEmail(twentyCsv.prefix, "CSVX01", 1);
      const originalId =
        await test.step("Pre-create a person that owns the first email", async () => {
          const id = await createPersonWithEmail(
            twentyCsv.api,
            `${twentyCsv.prefix}-CSVX01-original`,
            "Original",
            email,
          );
          twentyCsv.capturePerson(id);
          return id;
        });
      const filePath = await twentyCsv.writeCsv(
        "csvx01.csv",
        buildPeopleCsv({ prefix: twentyCsv.prefix, caseId: "CSVX01", rows: 3 }),
      );

      await test.step("Import three rows; no row is flagged", async () => {
        const wizard = new TwentyImportWizardPage(page);
        await people.goto();
        await wizard.open();
        await wizard.upload(filePath);
        await wizard.mapEmailsToPrimaryEmail();
        await wizard.nextStep();
        await wizard.showErrorsOnly();
        await wizard.expectDataRows(0);
        await wizard.showErrorsOnly();
        await wizard.confirm();
        await wizard.expectClosed();
      });
      await test.step("The list shows the CSV's first name", async () => {
        await people.goto();
        await people.filterNameContains(`${twentyCsv.prefix}-CSVX01-001`);
        await expect(people.rowsNamed(`${twentyCsv.prefix}-CSVX01-001`)).toBeVisible({
          timeout: twentyTimeouts().page,
        });
      });
      await test.step("API oracle: one person, same id, name overwritten", async () => {
        const owners = await listPeople(twentyCsv.api, emailEqFilter(email));
        expect(owners).toHaveLength(1);
        expect(owners[0]?.id).toBe(originalId);
        expect(owners[0]?.firstName).toBe(`${twentyCsv.prefix}-CSVX01-001`);
      });
    },
  );

  test(
    "P1-TW-CSV-X02 Same file imported twice at once never duplicates an email (single-round UI invariant smoke)",
    {
      annotation: [
        ...annotations("P1-TW-CSV-X02", "P2"),
        {
          type: "scope",
          description: "single-round UI smoke; multi-round concurrency belongs to P2 (API)",
        },
      ],
    },
    async ({ page, secondMemberPage, twentyCsv }) => {
      const people = new TwentyPeoplePage(page);
      const filePath = await twentyCsv.writeCsv(
        "csvx02.csv",
        buildPeopleCsv({ prefix: twentyCsv.prefix, caseId: "CSVX02", rows: 10 }),
      );

      await test.step("Import the same file in two contexts at once", async () => {
        await Promise.all([importClean(page, filePath), importClean(secondMemberPage, filePath)]);
      });
      await test.step("The list shows 10 rows", async () => {
        await people.goto();
        await people.filterNameContains(`${twentyCsv.prefix}-CSVX02`);
        await expect(people.viewCount()).toContainText("· 10", { timeout: twentyTimeouts().page });
      });
      await test.step("API oracle: 10 people with 10 distinct emails", async () => {
        const stored = await listPeople(twentyCsv.api, twentyCsv.caseFilter("CSVX02"));
        expect(stored).toHaveLength(10);
        expect(new Set(stored.map((person) => person.primaryEmail)).size).toBe(10);
      });
    },
  );

  test(
    "P1-TW-CSV-X03 Cancel mid-import keeps whole 200-row batches",
    { annotation: annotations("P1-TW-CSV-X03", "P3") },
    async ({ page, twentyCsv }) => {
      const people = new TwentyPeoplePage(page);
      const wizard = new TwentyImportWizardPage(page);
      const filePath = await twentyCsv.writeCsv(
        "csvx03.csv",
        buildPeopleCsv({ prefix: twentyCsv.prefix, caseId: "CSVX03", rows: 1000 }),
      );

      await test.step("Start the import and cancel after the first batch", async () => {
        await people.goto();
        await wizard.open();
        await wizard.upload(filePath);
        await wizard.mapEmailsToPrimaryEmail();
        await wizard.nextStep();
        await wizard.confirm();
        await expect(wizard.progress).toHaveText("200 out of 1,000 records imported.", {
          timeout: twentyTimeouts().page,
        });
        await wizard.cancelDuringImport();
        await wizard.expectClosed();
      });
      const persisted = await test.step("API: a whole number of batches remains", async () => {
        const n = await countPeople(twentyCsv.api, twentyCsv.caseFilter("CSVX03"));
        expect(n).toBeGreaterThanOrEqual(200);
        expect(n).toBeLessThan(1000);
        expect(n % 200).toBe(0);
        return n;
      });
      await test.step("The UI count equals the API count", async () => {
        await people.goto();
        await people.filterNameContains(`${twentyCsv.prefix}-CSVX03`);
        await expect(people.viewCount()).toContainText(`· ${String(persisted)}`, {
          timeout: twentyTimeouts().page,
        });
      });
    },
  );

  test(
    "P1-TW-CSV-X04 Row limit is 10,000",
    { annotation: annotations("P1-TW-CSV-X04", "P3") },
    async ({ page, twentyCsv }) => {
      const people = new TwentyPeoplePage(page);
      const wizard = new TwentyImportWizardPage(page);
      const over = await twentyCsv.writeCsv(
        "csvx04-over.csv",
        buildPeopleCsv({ prefix: twentyCsv.prefix, caseId: "CSVX04", rows: 10_001 }),
      );
      const exact = await twentyCsv.writeCsv(
        "csvx04-exact.csv",
        buildPeopleCsv({ prefix: twentyCsv.prefix, caseId: "CSVX04", rows: 10_000 }),
      );

      await test.step("10,001 rows are refused and the dialog stays on Upload", async () => {
        await people.goto();
        await wizard.open();
        await wizard.upload(over);
        await expect(wizard.tooManyRecordsToast).toBeVisible({ timeout: twentyTimeouts().page });
        await expect(wizard.uploadPrompt).toBeVisible();
        await wizard.close();
      });
      await test.step("10,000 rows reach Match Columns", async () => {
        await wizard.open();
        await wizard.upload(exact);
        await expect(wizard.nextStepButton).toBeVisible({ timeout: twentyTimeouts().page });
        await wizard.closeAndExit();
      });
      await test.step("API oracle: nothing was created", async () => {
        expect(await countPeople(twentyCsv.api, twentyCsv.caseFilter("CSVX04"))).toBe(0);
      });
    },
  );

  test(
    "P1-TW-CSV-X05 Header-only and empty files create nothing",
    { annotation: annotations("P1-TW-CSV-X05", "P3") },
    async ({ page, twentyCsv }) => {
      const people = new TwentyPeoplePage(page);
      const wizard = new TwentyImportWizardPage(page);
      const headerOnly = await twentyCsv.writeCsv(
        "csvx05-header.csv",
        buildPeopleCsv({ prefix: twentyCsv.prefix, caseId: "CSVX05", rows: 0 }),
      );
      const empty = await twentyCsv.writeCsv("csvx05-empty.csv", "");
      expect((await stat(empty)).size, "the empty file is 0 bytes (no BOM, no newline)").toBe(0);

      await test.step("Header-only reaches Validate with 0 rows and confirms", async () => {
        await people.goto();
        await wizard.open();
        await wizard.upload(headerOnly);
        await wizard.mapEmailsToPrimaryEmail();
        await wizard.nextStep();
        await wizard.expectDataRows(0);
        await wizard.confirm();
        await wizard.expectClosed();
      });
      await test.step("An empty file leaves the upload prompt in place", async () => {
        await wizard.open();
        await wizard.upload(empty);
        await expect(wizard.uploadPrompt).toBeVisible();
        await wizard.closeAndExit();
      });
      await test.step("API oracle: nothing was created", async () => {
        expect(await countPeople(twentyCsv.api, twentyCsv.caseFilter("CSVX05"))).toBe(0);
      });
    },
  );

  test(
    "P1-TW-CSV-X06 LF and quoted fields round-trip exactly",
    { annotation: annotations("P1-TW-CSV-X06", "P2") },
    async ({ page, twentyCsv }) => {
      const people = new TwentyPeoplePage(page);
      const lf = await twentyCsv.writeCsv(
        "csvx06-lf.csv",
        buildPeopleCsv({ prefix: twentyCsv.prefix, caseId: "CSVX06L", rows: 3, eol: "\n" }),
      );
      const quoted = await twentyCsv.writeCsv(
        "csvx06-quoted.csv",
        buildPeopleCsv(
          {
            prefix: twentyCsv.prefix,
            caseId: "CSVX06Q",
            rows: 2,
            mutate: (index, row) =>
              index === 1
                ? { ...row, lastName: "Doe, Jr.", extra: ["Head; of, Sales", "Line one\nLine two"] }
                : { ...row, lastName: 'Say "hi"', extra: ["Plain", "Plain"] },
          },
          ["Job Title", "Intro"],
        ),
      );

      await test.step("Import the LF file", async () => {
        await importClean(page, lf);
      });
      await test.step("Import the quoted CRLF file", async () => {
        await importClean(page, quoted);
      });
      await test.step("The list shows all five rows", async () => {
        await people.goto();
        await people.filterNameContains(`${twentyCsv.prefix}-CSVX06`);
        await expect(people.viewCount()).toContainText("· 5", { timeout: twentyTimeouts().page });
      });
      await test.step("API oracle: quoted values are stored exactly", async () => {
        const stored = await listPeople(twentyCsv.api, twentyCsv.caseFilter("CSVX06Q"));
        const byFirst = new Map(stored.map((person) => [person.firstName, person]));
        const first = byFirst.get(`${twentyCsv.prefix}-CSVX06Q-001`);
        const second = byFirst.get(`${twentyCsv.prefix}-CSVX06Q-002`);
        expect(first?.lastName).toBe("Doe, Jr.");
        expect(first?.jobTitle).toBe("Head; of, Sales");
        expect(first?.intro).toBe("Line one\nLine two");
        expect(second?.lastName).toBe('Say "hi"');
        expect(await countPeople(twentyCsv.api, twentyCsv.caseFilter("CSVX06L"))).toBe(3);
      });
    },
  );

  test(
    "P1-TW-CSV-X07 The confirm Submit is a button for assistive technology",
    { annotation: annotations("P1-TW-CSV-X07", "P3") },
    async ({ page, twentyCsv }, testInfo) => {
      const people = new TwentyPeoplePage(page);
      const wizard = new TwentyImportWizardPage(page);
      const filePath = await twentyCsv.writeCsv(
        "csvx07.csv",
        buildPeopleCsv({
          prefix: twentyCsv.prefix,
          caseId: "CSVX07",
          rows: 10,
          mutate: (index, row) => (index === 5 ? { ...row, email: "not-an-email" } : row),
        }),
      );

      await test.step("Reach the Finish flow with errors confirm", async () => {
        await people.goto();
        await wizard.open();
        await wizard.upload(filePath);
        await wizard.mapEmailsToPrimaryEmail();
        await wizard.nextStep();
        await wizard.confirm();
        await expect(wizard.finishWithErrorsTitle).toBeVisible();
        await expect(wizard.submitIgnoringErrorsButton).toBeVisible();
      });
      const evidence = await test.step("Record the role query and the DOM ancestry", async () => ({
        submitRoleCount: await page.getByRole("button", { name: "Submit" }).count(),
        submitUnderAriaHidden: await wizard.submitIsUnderAriaHidden(),
      }));
      await attachKnownBugEvidence(page, testInfo, {
        issue: TW_CSV_X07_SUBMIT_HIDDEN_ISSUE,
        observed: { ...evidence, submitTextCount: 1 },
        expected: { submitRoleCount: 1, submitUnderAriaHidden: false },
      });
      test.fail(true, TW_CSV_X07_SUBMIT_HIDDEN_ISSUE);
      await expect(page.getByRole("button", { name: "Submit" })).toBeVisible();
    },
  );
});
