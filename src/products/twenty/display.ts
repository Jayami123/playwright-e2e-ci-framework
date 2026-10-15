import {
  addDays,
  civilDateFromInstant,
  civilDateToIso,
  fromZonedCivil,
  zonedCivilOf,
} from "../../core/timezone.js";
import { BERLIN_TZ, KIRITIMATI_TZ } from "./timezones.js";

const CIVIL_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

const CIVIL_DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

/** DATE field oracle (`YYYY-MM-DD`). Uses UTC noon so the calendar day cannot shift in Node. */
export function formatTwentyDate(birthdayYmd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdayYmd);
  if (match === null) {
    throw new Error(`formatTwentyDate expected YYYY-MM-DD, got ${birthdayYmd}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  if (
    instant.getUTCFullYear() !== year ||
    instant.getUTCMonth() !== month - 1 ||
    instant.getUTCDate() !== day
  ) {
    throw new RangeError(`formatTwentyDate invalid calendar date: ${birthdayYmd}`);
  }
  instant.setUTCHours(12, 0, 0, 0);
  return new Intl.DateTimeFormat("en-US", { ...CIVIL_DATE_FORMAT, timeZone: "UTC" }).format(
    instant,
  );
}

/** DATE_TIME civil string in member IANA TZ (12-hour, MONTH_FIRST). No TZ abbrev. */
export function formatTwentyDateTime(iso: string, timeZone: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`formatTwentyDateTime invalid ISO: ${iso}`);
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    ...CIVIL_DATE_TIME_FORMAT,
    timeZone,
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((entry) => entry.type === type);
    if (part === undefined) {
      throw new Error(`formatTwentyDateTime missing part ${type}`);
    }
    return part.value;
  };
  return `${pick("month")} ${pick("day")}, ${pick("year")} ${pick("hour")}:${pick("minute")} ${pick("dayPeriod")}`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const BERLIN_SPRING_0030_ISO = fromZonedCivil(BERLIN_TZ, {
  year: 2027,
  month: 3,
  day: 28,
  hour: 0,
  minute: 30,
}).toISOString();

export const BERLIN_SPRING_CTRL_ISO = fromZonedCivil(BERLIN_TZ, {
  year: 2027,
  month: 3,
  day: 27,
  hour: 23,
  minute: 30,
}).toISOString();

export const BERLIN_FALL_0030_ISO = fromZonedCivil(BERLIN_TZ, {
  year: 2027,
  month: 10,
  day: 31,
  hour: 0,
  minute: 30,
}).toISOString();

export const BERLIN_FALL_CTRL_ISO = fromZonedCivil(BERLIN_TZ, {
  year: 2027,
  month: 10,
  day: 30,
  hour: 23,
  minute: 30,
}).toISOString();

/** First 02:30 on Berlin fall-back Sunday 2027-10-31 (still CEST). */
export const BERLIN_FALL_0230_CEST_ISO = "2027-10-31T00:30:00.000Z";

/** Second 02:30 on Berlin fall-back Sunday 2027-10-31 (CET). */
export const BERLIN_FALL_0230_CET_ISO = "2027-10-31T01:30:00.000Z";

export function zonedDayNumber(iso: string, timeZone: string): number {
  return zonedCivilOf(new Date(iso), timeZone).day;
}

export function kiritimatiCivilDateFromMs(nowMs: number): string {
  return civilDateToIso(civilDateFromInstant(new Date(nowMs), KIRITIMATI_TZ));
}

export function kiritimatiHalfPastIso(nowMs: number, dayOffset: number): string {
  const civil = civilDateFromInstant(new Date(nowMs), KIRITIMATI_TZ);
  const day = addDays(civil, dayOffset);
  return fromZonedCivil(KIRITIMATI_TZ, { ...day, hour: 0, minute: 30 }).toISOString();
}

export function assertKiritimatiDateUnchanged(startMs: number, endMs: number): void {
  const start = kiritimatiCivilDateFromMs(startMs);
  const end = kiritimatiCivilDateFromMs(endMs);
  if (start !== end) {
    throw new Error(`clock crossed midnight: Kiritimati date ${start} -> ${end}`);
  }
}

export function parseCalendarMonthHeading(heading: string): { year: number; month: number } {
  const match =
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/.exec(
      heading.trim(),
    );
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new Error(
      `parseCalendarMonthHeading expected "MMMM yyyy", got ${JSON.stringify(heading)}`,
    );
  }
  const month = (MONTH_NAMES as readonly string[]).indexOf(match[1]) + 1;
  return { year: Number(match[2]), month };
}

export function calendarMonthHeading(year: number, month: number): string {
  const name = MONTH_NAMES[month - 1];
  if (name === undefined) {
    throw new Error(`calendarMonthHeading invalid month ${String(month)}`);
  }
  return `${name} ${String(year)}`;
}

/** Positive = Next period clicks; negative = Previous period clicks. */
export function monthClicksFromHeading(
  heading: string,
  targetYear: number,
  targetMonth: number,
): number {
  const from = parseCalendarMonthHeading(heading);
  return targetYear * 12 + targetMonth - (from.year * 12 + from.month);
}

function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

export function csvCellByName(csv: string, recordName: string, column: string): string {
  const lines = csv.trim().split(/\r?\n/);
  const headerLine = lines[0];
  if (headerLine === undefined) {
    throw new Error("csvCellByName: empty CSV");
  }
  const headers = splitCsvRow(headerLine);
  const nameIndex = headers.indexOf("Name");
  const columnIndex = headers.indexOf(column);
  if (nameIndex < 0) {
    throw new Error(`csvCellByName: no Name column in ${JSON.stringify(headers)}`);
  }
  if (columnIndex < 0) {
    throw new Error(`csvCellByName: no ${column} column in ${JSON.stringify(headers)}`);
  }
  for (const line of lines.slice(1)) {
    const cells = splitCsvRow(line);
    if (cells[nameIndex] === recordName) {
      const value = cells[columnIndex];
      if (value === undefined) {
        throw new Error(`csvCellByName: row ${recordName} missing ${column}`);
      }
      return value;
    }
  }
  throw new Error(`csvCellByName: no row named ${recordName}`);
}
