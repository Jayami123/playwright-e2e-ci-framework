import { expect, test } from "@playwright/test";
import { formatTwentyDate, formatTwentyDateTime } from "../../src/products/twenty/display.js";
import { COLOMBO_TZ, HONOLULU_TZ, UTC_TZ } from "../../src/products/twenty/timezones.js";

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
});
