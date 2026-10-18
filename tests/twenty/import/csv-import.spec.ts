import { buildPeopleCsv, peopleCsvEmail } from "../../../src/products/twenty/csv.js";
import { twentyTimeouts } from "../../../src/products/twenty/env.js";
import {
  countPeople,
  emailEqFilter,
  listPeople,
} from "../../../src/products/twenty/fixtures/people-bulk.js";
import { expect, test } from "../../../src/products/twenty/import-fixtures.js";
import { TwentyImportWizardPage } from "../../../src/products/twenty/pages/import-wizard.page.js";
import { TwentyPeoplePage } from "../../../src/products/twenty/pages/people.page.js";

const UMLAUT_NAMES = [
  { first: "Jürgen", last: "Müller-Lüdenscheid" },
  { first: "Björn", last: "Größe" },
  { first: "Zoë", last: "Östergård n" },
  { first: "Åsa", last: "Ñandú" },
  { first: "Çağlar", last: "Schäfer" },
] as const;

test.describe("Twenty CSV import", { tag: ["@twenty", "@csv"] }, () => {
  test(
    "P1-TW-CSV-001 Import 100 people with a UTF-8 BOM",
    {
      annotation: [
        { type: "testId", description: "P1-TW-CSV-001" },
        { type: "priority", description: "P1" },
      ],
    },
    async ({ page, twentyCsv }) => {
      const people = new TwentyPeoplePage(page);
      const wizard = new TwentyImportWizardPage(page);
      const filePath = await test.step("Generate a 100-row CSV with a BOM", async () =>
        twentyCsv.writeCsv(
          "csv001.csv",
          buildPeopleCsv({ prefix: twentyCsv.prefix, caseId: "CSV001", rows: 100, bom: true }),
        ));

      await test.step("Open the import and upload", async () => {
        await people.goto();
        await wizard.open();
        await wizard.upload(filePath);
      });
      await test.step("The first header is not mangled by the BOM", async () => {
        await wizard.expectImportedColumn("First Name");
        await expect(wizard.mappedField("Name / First Name")).toBeVisible();
      });
      await test.step("Map Emails and validate: no error rows", async () => {
        await wizard.mapEmailsToPrimaryEmail();
        await wizard.nextStep();
        await wizard.showErrorsOnly();
        await wizard.expectDataRows(0);
        await wizard.showErrorsOnly();
      });
      await test.step("Confirm the import", async () => {
        await wizard.confirm();
        await wizard.expectClosed();
      });
      await test.step("The People list shows the 100 imported rows", async () => {
        await people.goto();
        await people.filterNameContains(`${twentyCsv.prefix}-CSV001`);
        await expect(people.viewCount()).toContainText("· 100", {
          timeout: twentyTimeouts().page,
        });
        await expect(people.rowsNamed(twentyCsv.prefix)).not.toHaveCount(0);
      });
      await test.step("API oracle: 100 people and no BOM in any first name", async () => {
        const filter = twentyCsv.caseFilter("CSV001");
        expect(await countPeople(twentyCsv.api, filter)).toBe(100);
        const withBom = (await listPeople(twentyCsv.api, filter)).filter((person) =>
          person.firstName.startsWith("﻿"),
        );
        expect(withBom).toHaveLength(0);
      });
    },
  );

  test(
    "P1-TW-CSV-002 Semicolon-delimited German Excel export",
    {
      annotation: [
        { type: "testId", description: "P1-TW-CSV-002" },
        { type: "priority", description: "P2" },
      ],
    },
    async ({ page, twentyCsv }) => {
      const people = new TwentyPeoplePage(page);
      const wizard = new TwentyImportWizardPage(page);
      const expected = UMLAUT_NAMES.map((name) => ({
        firstName: `${twentyCsv.prefix}-CSV002-${name.first}`,
        lastName: name.last,
      }));
      const filePath = await test.step("Generate a ';' CSV with umlauts", async () =>
        twentyCsv.writeCsv(
          "csv002.csv",
          buildPeopleCsv({
            prefix: twentyCsv.prefix,
            caseId: "CSV002",
            rows: UMLAUT_NAMES.length,
            delimiter: ";",
            mutate: (index, row) => ({
              ...row,
              firstName: expected[index - 1]?.firstName ?? row.firstName,
              lastName: expected[index - 1]?.lastName ?? row.lastName,
            }),
          }),
        ));

      await test.step("Three columns are detected without a delimiter choice", async () => {
        await people.goto();
        await wizard.open();
        await wizard.upload(filePath);
        await wizard.expectImportedColumn("First Name");
        await wizard.expectImportedColumn("Last Name");
        await wizard.expectImportedColumn("Emails");
      });
      await test.step("Map, validate and confirm", async () => {
        await wizard.mapEmailsToPrimaryEmail();
        await wizard.nextStep();
        await wizard.confirm();
        await wizard.expectClosed();
      });
      await test.step("The list shows the umlaut name", async () => {
        await people.goto();
        await people.filterNameContains(`${twentyCsv.prefix}-CSV002`);
        await expect(people.viewCount()).toContainText("· 5", { timeout: twentyTimeouts().page });
        await expect(people.rowsNamed("Jürgen")).toBeVisible();
      });
      await test.step("API oracle: names equal the generated strings", async () => {
        const stored = await listPeople(twentyCsv.api, twentyCsv.caseFilter("CSV002"));
        expect(
          stored
            .map((person) => ({ firstName: person.firstName, lastName: person.lastName }))
            .sort((a, b) => a.firstName.localeCompare(b.firstName)),
        ).toEqual([...expected].sort((a, b) => a.firstName.localeCompare(b.firstName)));
      });
    },
  );

  test(
    "P1-TW-CSV-003 Bad row mid-file imports the other 99",
    {
      annotation: [
        { type: "testId", description: "P1-TW-CSV-003" },
        { type: "priority", description: "P1" },
      ],
    },
    async ({ page, twentyCsv }) => {
      const people = new TwentyPeoplePage(page);
      const wizard = new TwentyImportWizardPage(page);
      const filePath = await test.step("Generate 100 rows, row 50 with a bad email", async () =>
        twentyCsv.writeCsv(
          "csv003.csv",
          buildPeopleCsv({
            prefix: twentyCsv.prefix,
            caseId: "CSV003",
            rows: 100,
            mutate: (index, row) => (index === 50 ? { ...row, email: "not-an-email" } : row),
          }),
        ));

      await test.step("Validate flags exactly the bad row", async () => {
        await people.goto();
        await wizard.open();
        await wizard.upload(filePath);
        await wizard.mapEmailsToPrimaryEmail();
        await wizard.nextStep();
        await wizard.showErrorsOnly();
        await wizard.expectDataRows(1);
        await wizard.expectCellError("not-an-email", "Emails / Primary Email is not a valid email");
      });
      await test.step("Confirm warns that rows with errors are ignored", async () => {
        await wizard.confirm();
        await expect(wizard.finishWithErrorsTitle).toBeVisible();
        await expect(
          page.getByText("Rows with errors will be ignored when submitting."),
        ).toBeVisible();
        await wizard.submitIgnoringErrors();
        await wizard.expectClosed();
      });
      await test.step("The list shows 99 rows", async () => {
        await people.goto();
        await people.filterNameContains(`${twentyCsv.prefix}-CSV003`);
        await expect(people.viewCount()).toContainText("· 99", { timeout: twentyTimeouts().page });
      });
      await test.step("API oracle: 99 people and no row 050", async () => {
        const stored = await listPeople(twentyCsv.api, twentyCsv.caseFilter("CSV003"));
        expect(stored).toHaveLength(99);
        expect(stored.filter((person) => person.firstName.endsWith("-050"))).toHaveLength(0);
      });
    },
  );

  test(
    "P1-TW-CSV-004 Duplicate email in the file",
    {
      annotation: [
        { type: "testId", description: "P1-TW-CSV-004" },
        { type: "priority", description: "P2" },
      ],
    },
    async ({ page, twentyCsv }) => {
      const people = new TwentyPeoplePage(page);
      const wizard = new TwentyImportWizardPage(page);
      const duplicate = peopleCsvEmail(twentyCsv.prefix, "CSV004", 5);
      const filePath = await test.step("Generate 10 rows, rows 5 and 6 share an email", async () =>
        twentyCsv.writeCsv(
          "csv004.csv",
          buildPeopleCsv({
            prefix: twentyCsv.prefix,
            caseId: "CSV004",
            rows: 10,
            mutate: (index, row) => (index === 6 ? { ...row, email: duplicate } : row),
          }),
        ));

      await test.step("Both rows are flagged", async () => {
        await people.goto();
        await wizard.open();
        await wizard.upload(filePath);
        await wizard.mapEmailsToPrimaryEmail();
        await wizard.nextStep();
        await wizard.showErrorsOnly();
        await wizard.expectDataRows(2);
        await wizard.expectFirstCellError(
          duplicate,
          "This Primary Email (emails) value already exists in your import data",
        );
      });
      await test.step("Submit ignoring errors", async () => {
        await wizard.confirm();
        await wizard.submitIgnoringErrors();
        await wizard.expectClosed();
      });
      await test.step("The list shows 8 rows", async () => {
        await people.goto();
        await people.filterNameContains(`${twentyCsv.prefix}-CSV004`);
        await expect(people.viewCount()).toContainText("· 8", { timeout: twentyTimeouts().page });
      });
      await test.step("API oracle: nobody has the duplicate email, 8 people in total", async () => {
        expect(await countPeople(twentyCsv.api, emailEqFilter(duplicate))).toBe(0);
        expect(await countPeople(twentyCsv.api, twentyCsv.caseFilter("CSV004"))).toBe(8);
      });
    },
  );
});
