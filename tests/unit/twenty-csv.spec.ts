import { expect, test } from "@playwright/test";
import {
  buildPeopleCsv,
  csvField,
  peopleCsvEmail,
  peopleCsvFirstName,
} from "../../src/products/twenty/csv.js";

const PREFIX = "P1-QA-1-0";

test.describe("Twenty people CSV builder", { tag: ["@unit", "@twenty-fixture"] }, () => {
  test("a BOM is the first character only when asked", () => {
    expect(buildPeopleCsv({ prefix: PREFIX, caseId: "C", rows: 1, bom: true }).charCodeAt(0)).toBe(
      0xfeff,
    );
    expect(buildPeopleCsv({ prefix: PREFIX, caseId: "C", rows: 1 }).startsWith("First Name")).toBe(
      true,
    );
  });

  test("semicolon delimiter joins the header and rows", () => {
    const csv = buildPeopleCsv({ prefix: PREFIX, caseId: "C", rows: 1, delimiter: ";" });
    expect(csv.split("\r\n")[0]).toBe("First Name;Last Name;Emails");
    expect(csv.split("\r\n")[1]?.split(";")).toHaveLength(3);
  });

  test("CRLF by default and LF on request", () => {
    expect(buildPeopleCsv({ prefix: PREFIX, caseId: "C", rows: 2 }).split("\r\n")).toHaveLength(4);
    const lf = buildPeopleCsv({ prefix: PREFIX, caseId: "C", rows: 2, eol: "\n" });
    expect(lf).not.toContain("\r");
    expect(lf.split("\n")).toHaveLength(4);
  });

  test("quotes delimiters, quotes and newlines", () => {
    expect(csvField("Doe, Jr.", ",")).toBe('"Doe, Jr."');
    expect(csvField("Head; of", ";")).toBe('"Head; of"');
    expect(csvField('Say "hi"', ",")).toBe('"Say ""hi"""');
    expect(csvField("Line one\nLine two", ",")).toBe('"Line one\nLine two"');
    expect(csvField("plain", ",")).toBe("plain");
  });

  test("first name and email shapes", () => {
    expect(peopleCsvFirstName(PREFIX, "CSV001", 7)).toBe("P1-QA-1-0-CSV001-007");
    expect(peopleCsvEmail(PREFIX, "CSV001", 7)).toBe("p1-qa-1-0-csv001-7@example.test");
  });

  test("mutate replaces one row", () => {
    const csv = buildPeopleCsv({
      prefix: PREFIX,
      caseId: "C",
      rows: 50,
      mutate: (index, row) => (index === 50 ? { ...row, email: "not-an-email" } : row),
    });
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(51);
    expect(lines[50]?.endsWith(",not-an-email")).toBe(true);
    expect(lines[49]?.endsWith("@example.test")).toBe(true);
  });

  test("extra columns follow the header and the row", () => {
    const csv = buildPeopleCsv(
      {
        prefix: PREFIX,
        caseId: "C",
        rows: 1,
        mutate: (_index, row) => ({ ...row, extra: ["Head; of, Sales", "a"] }),
      },
      ["Job Title", "Intro"],
    );
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("First Name,Last Name,Emails,Job Title,Intro");
    expect(lines[1]?.endsWith(',"Head; of, Sales",a')).toBe(true);
  });
});
