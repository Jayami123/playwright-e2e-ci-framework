import { expect, test } from "@playwright/test";
import { fromZonedCivil } from "../../src/core/timezone.js";
import {
  assertKiritimatiDateUnchanged,
  BERLIN_FALL_0030_ISO,
  BERLIN_FALL_0230_CEST_ISO,
  BERLIN_FALL_0230_CET_ISO,
  BERLIN_FALL_CTRL_ISO,
  BERLIN_SPRING_0030_ISO,
  BERLIN_SPRING_CTRL_ISO,
  calendarMonthHeading,
  csvCellByName,
  formatTwentyDate,
  formatTwentyDateTime,
  kiritimatiHalfPastIso,
  monthClicksFromHeading,
  parseCalendarMonthHeading,
  zonedDayNumber,
} from "../../src/products/twenty/display.js";
import {
  BERLIN_TZ,
  COLOMBO_TZ,
  HONOLULU_TZ,
  KIRITIMATI_TZ,
  UTC_TZ,
} from "../../src/products/twenty/timezones.js";

const ISO = "2027-01-01T00:30:00.000Z";
const BIRTHDAY = "2027-01-01";

test.describe("Twenty display oracles", { tag: ["@unit", "@twenty"] }, () => {
  test("DATE civil string is identical across Honolulu and Kiritimati", () => {
    const honolulu = formatTwentyDate(BIRTHDAY);
    const kiritimati = formatTwentyDate(BIRTHDAY);
    expect(honolulu).toBe("Jan 1, 2027");
    expect(kiritimati).toBe(honolulu);
  });

  test("DATE_TIME civil strings for Colombo and UTC", () => {
    expect(formatTwentyDateTime(ISO, COLOMBO_TZ)).toBe("Jan 1, 2027 6:00 AM");
    expect(formatTwentyDateTime(ISO, UTC_TZ)).toBe("Jan 1, 2027 12:30 AM");
  });

  test("DATE_TIME Honolulu crosses civil day", () => {
    expect(formatTwentyDateTime(ISO, HONOLULU_TZ)).toBe("Dec 31, 2026 2:30 PM");
  });

  test("uses String() in template paths", () => {
    const year = 2027;
    const ymd = `${String(year)}-01-01`;
    expect(formatTwentyDate(ymd)).toBe("Jan 1, 2027");
  });

  test("rejects invalid calendar dates", () => {
    expect(() => formatTwentyDate("2026-02-31")).toThrow(RangeError);
  });

  test("preserves year 0-99 without Date.UTC remapping", () => {
    expect(formatTwentyDate("0099-01-01")).toBe("Jan 1, 99");
  });

  test("accepts leap day 2024-02-29", () => {
    expect(formatTwentyDate("2024-02-29")).toBe("Feb 29, 2024");
  });

  test("Berlin DST civil strings and calendar days", () => {
    expect(BERLIN_SPRING_0030_ISO).toBe("2027-03-27T23:30:00.000Z");
    expect(BERLIN_SPRING_CTRL_ISO).toBe("2027-03-27T22:30:00.000Z");
    expect(formatTwentyDateTime(BERLIN_SPRING_0030_ISO, BERLIN_TZ)).toBe("Mar 28, 2027 12:30 AM");
    expect(formatTwentyDateTime(BERLIN_SPRING_CTRL_ISO, BERLIN_TZ)).toBe("Mar 27, 2027 11:30 PM");
    expect(zonedDayNumber(BERLIN_SPRING_0030_ISO, BERLIN_TZ)).toBe(28);
    expect(zonedDayNumber(BERLIN_SPRING_0030_ISO, UTC_TZ)).toBe(27);
    expect(formatTwentyDateTime(BERLIN_FALL_0030_ISO, BERLIN_TZ)).toBe("Oct 31, 2027 12:30 AM");
    expect(formatTwentyDateTime(BERLIN_FALL_CTRL_ISO, BERLIN_TZ)).toBe("Oct 30, 2027 11:30 PM");
    expect(formatTwentyDateTime(BERLIN_FALL_0230_CEST_ISO, BERLIN_TZ)).toBe("Oct 31, 2027 2:30 AM");
    expect(formatTwentyDateTime(BERLIN_FALL_0230_CET_ISO, BERLIN_TZ)).toBe("Oct 31, 2027 2:30 AM");
  });

  test("Kiritimati today 00:30 is the previous UTC calendar day", () => {
    const noon = fromZonedCivil(KIRITIMATI_TZ, {
      year: 2027,
      month: 6,
      day: 15,
      hour: 12,
      minute: 0,
    }).getTime();
    const iso = kiritimatiHalfPastIso(noon, 0);
    expect(iso).toBe("2027-06-14T10:30:00.000Z");
    expect(iso.slice(0, 10)).not.toBe("2027-06-15");
    expect(kiritimatiHalfPastIso(noon, 1)).toBe("2027-06-15T10:30:00.000Z");
    expect(kiritimatiHalfPastIso(noon, -1)).toBe("2027-06-13T10:30:00.000Z");
  });

  test("assertKiritimatiDateUnchanged fails when nowMs crosses midnight", () => {
    const midnight = fromZonedCivil(KIRITIMATI_TZ, {
      year: 2027,
      month: 6,
      day: 15,
      hour: 0,
      minute: 0,
    }).getTime();
    const before = midnight - 500;
    const after = midnight + 500;
    expect(() => {
      assertKiritimatiDateUnchanged(before, after);
    }).toThrow(/clock crossed midnight/);
    expect(() => {
      assertKiritimatiDateUnchanged(before, before + 1);
    }).not.toThrow();
  });

  test("month heading parse and click count from UI heading", () => {
    expect(parseCalendarMonthHeading("October 2026 GMT+2")).toEqual({ year: 2026, month: 10 });
    expect(monthClicksFromHeading("October 2026 GMT+2", 2027, 3)).toBe(5);
    expect(monthClicksFromHeading("March 2027", 2027, 10)).toBe(7);
    expect(calendarMonthHeading(2027, 3)).toBe("March 2027");
  });

  test("csvCellByName reads DATE_TIME and DATE columns", () => {
    const csv = `Name,Close date,Birthday\nP1-QA-1-0-x04,2027-01-01T00:30:00.000Z,2027-01-01\n`;
    expect(csvCellByName(csv, "P1-QA-1-0-x04", "Close date")).toBe("2027-01-01T00:30:00.000Z");
    expect(csvCellByName(csv, "P1-QA-1-0-x04", "Birthday")).toBe("2027-01-01");
  });
});
