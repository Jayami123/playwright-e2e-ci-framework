export interface PeopleCsvRow {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly extra?: readonly string[];
}

export interface PeopleCsvOptions {
  /** P1-QA-<seed>-<worker> */
  readonly prefix: string;
  /** Case leaf, e.g. "CSV001". */
  readonly caseId: string;
  readonly rows: number;
  readonly delimiter?: "," | ";";
  readonly eol?: "\r\n" | "\n";
  readonly bom?: boolean;
  readonly mutate?: (index: number, row: PeopleCsvRow) => PeopleCsvRow;
}

export const PEOPLE_CSV_HEADER = ["First Name", "Last Name", "Emails"] as const;

const BOM = "﻿";

function pad3(index: number): string {
  return String(index).padStart(3, "0");
}

export function peopleCsvFirstName(prefix: string, caseId: string, index: number): string {
  return `${prefix}-${caseId}-${pad3(index)}`;
}

export function peopleCsvEmail(prefix: string, caseId: string, index: number): string {
  return `${prefix}-${caseId}-${String(index)}@example.test`.toLowerCase();
}

/** RFC 4180: quote when the value holds the delimiter, a quote, CR or LF; double inner quotes. */
export function csvField(value: string, delimiter: string): string {
  if (value.includes(delimiter) || /["\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function buildPeopleCsv(
  options: PeopleCsvOptions,
  extraHeader: readonly string[] = [],
): string {
  const delimiter = options.delimiter ?? ",";
  const eol = options.eol ?? "\r\n";
  const lines: string[] = [[...PEOPLE_CSV_HEADER, ...extraHeader].join(delimiter)];
  for (let index = 1; index <= options.rows; index += 1) {
    const base: PeopleCsvRow = {
      firstName: peopleCsvFirstName(options.prefix, options.caseId, index),
      lastName: `Lastname${pad3(index)}`,
      email: peopleCsvEmail(options.prefix, options.caseId, index),
    };
    const row = options.mutate === undefined ? base : options.mutate(index, base);
    lines.push(
      [row.firstName, row.lastName, row.email, ...(row.extra ?? [])]
        .map((field) => csvField(field, delimiter))
        .join(delimiter),
    );
  }
  return `${options.bom === true ? BOM : ""}${lines.join(eol)}${eol}`;
}
