import { expect, test } from "@playwright/test";
import {
  civilDateToIso,
  expectedSlotEntriesForViewerDay,
  expectedSlotInstants,
  expectedSlotLabelsForViewerDay,
  fromZonedCivil,
  lastWeekdayOfMonth,
  localTimeExists,
  nextTransitionStrictlyAfterLeadDays,
  nextWeekdayAfter,
  normalizeSlotLabel,
  nthWeekdayOfMonth,
  toBookingSuccessWhenLine,
  toZonedLabel,
  WEEKDAY,
} from "../../src/core/timezone.js";
import { BOOKING_NOTICE_EPOCH, MIN_LEAD_DAYS } from "../../src/products/cal/schedules.js";
import {
  ADELAIDE_TZ,
  AUCKLAND_TZ,
  LONDON_TZ,
  NEW_YORK_TZ,
} from "../../src/products/cal/timezones.js";

test.describe("timezone helpers", () => {
  test("computes US and EU DST transition Sundays", { tag: ["@unit", "@tz"] }, () => {
    expect(civilDateToIso(nthWeekdayOfMonth(2027, 3, WEEKDAY.sunday, 2))).toBe("2027-03-14");
    expect(civilDateToIso(nthWeekdayOfMonth(2026, 11, WEEKDAY.sunday, 1))).toBe("2026-11-01");
    expect(civilDateToIso(lastWeekdayOfMonth(2027, 3, WEEKDAY.sunday))).toBe("2027-03-28");
    expect(
      civilDateToIso(
        nextTransitionStrictlyAfterLeadDays(
          { year: 2026, month: 10, day: 8 },
          MIN_LEAD_DAYS,
          (year) => nthWeekdayOfMonth(year, 3, WEEKDAY.sunday, 2),
        ),
      ),
    ).toBe("2027-03-14");
    expect(
      civilDateToIso(
        nextTransitionStrictlyAfterLeadDays(
          { year: 2026, month: 10, day: 8 },
          MIN_LEAD_DAYS,
          (year) => nthWeekdayOfMonth(year, 11, WEEKDAY.sunday, 1),
        ),
      ),
    ).toBe("2026-11-01");
    expect(
      civilDateToIso(
        nextTransitionStrictlyAfterLeadDays(
          { year: 2026, month: 10, day: 8 },
          MIN_LEAD_DAYS,
          (year) => lastWeekdayOfMonth(year, 3, WEEKDAY.sunday),
        ),
      ),
    ).toBe("2027-03-28");
  });

  test("when today is the DST Sunday, transition is next year", { tag: ["@unit", "@tz"] }, () => {
    const fallBackSunday = { year: 2026, month: 11, day: 1 };
    expect(
      civilDateToIso(
        nextTransitionStrictlyAfterLeadDays(fallBackSunday, MIN_LEAD_DAYS, (year) =>
          nthWeekdayOfMonth(year, 11, WEEKDAY.sunday, 1),
        ),
      ),
    ).toBe("2027-11-07");
  });

  test("skips today when asking for the next weekday", { tag: ["@unit", "@tz"] }, () => {
    const friday = { year: 2026, month: 10, day: 9 };
    expect(civilDateToIso(nextWeekdayAfter(friday, "Europe/London", true))).toBe("2026-10-12");
  });

  test("formats viewer labels with Intl, not hard-coded offsets", { tag: ["@unit", "@tz"] }, () => {
    const nineLondon = fromZonedCivil("Europe/London", {
      year: 2026,
      month: 10,
      day: 9,
      hour: 9,
      minute: 0,
    });
    expect(toZonedLabel(nineLondon, "Asia/Colombo")).toBe("1:30pm");
    expect(toZonedLabel(nineLondon, "Pacific/Auckland")).toBe("9:00pm");
    expect(normalizeSlotLabel("9:00 AM")).toBe("9:00am");
  });

  test("formats booking success When line like Cal success page", { tag: ["@unit", "@tz"] }, () => {
    const start = fromZonedCivil("Europe/London", {
      year: 2026,
      month: 10,
      day: 9,
      hour: 9,
      minute: 0,
    });
    const line = toBookingSuccessWhenLine(start, 30, "Asia/Colombo");
    expect(line).toMatch(/^1:30\sPM\s-\s2:00\sPM\s\(.+\)$/i);
    expect(normalizeSlotLabel(line.split(" - ")[0] ?? line)).toBe("1:30pm");
  });

  test("spring-forward skips 02:00–02:59 America/New_York", { tag: ["@unit", "@tz"] }, () => {
    const date = { year: 2027, month: 3, day: 14 };
    expect(localTimeExists(NEW_YORK_TZ, { ...date, hour: 2, minute: 30 })).toBe(false);
    expect(localTimeExists(NEW_YORK_TZ, { ...date, hour: 1, minute: 30 })).toBe(true);
    expect(localTimeExists(NEW_YORK_TZ, { ...date, hour: 3, minute: 0 })).toBe(true);
    const instants = expectedSlotInstants({
      timeZone: NEW_YORK_TZ,
      date,
      startMinutes: 0,
      endMinutes: 8 * 60,
      stepMinutes: 30,
    });
    expect(instants).toHaveLength(14);
    const labels = instants.map((instant) => toZonedLabel(instant, NEW_YORK_TZ));
    expect(labels.some((label) => label.startsWith("2:"))).toBe(false);
  });

  test("fall-back 01:30 has two UTC instants", { tag: ["@unit", "@tz"] }, () => {
    const date = { year: 2026, month: 11, day: 1 };
    const first = fromZonedCivil(NEW_YORK_TZ, { ...date, hour: 1, minute: 30 });
    const later = new Date(first.getTime() + 60 * 60 * 1000);
    expect(toZonedLabel(first, NEW_YORK_TZ)).toBe("1:30am");
    expect(toZonedLabel(later, NEW_YORK_TZ)).toBe("1:30am");
    expect(later.getTime() - first.getTime()).toBe(60 * 60 * 1000);
  });

  test(
    "expectedSlotLabelsForViewerDay filters by viewer civil date",
    { tag: ["@unit", "@tz"] },
    () => {
      const viewerDate = { year: 2026, month: 10, day: 9 };
      const labels = expectedSlotLabelsForViewerDay({
        organiserTimeZone: LONDON_TZ,
        viewerTimeZone: "Asia/Colombo",
        viewerDate,
        windows: [{ days: [WEEKDAY.friday], startMinutes: 9 * 60, endMinutes: 17 * 60 }],
        stepMinutes: 30,
        notBefore: BOOKING_NOTICE_EPOCH,
      });
      expect(labels.length).toBeGreaterThan(0);
      expect(labels[0]).toBe("1:30pm");
    },
  );

  test(
    "cross-midnight organiser window lists Auckland viewer labels",
    { tag: ["@unit", "@tz"] },
    () => {
      const viewerDate = { year: 2026, month: 10, day: 12 };
      const labels = expectedSlotLabelsForViewerDay({
        organiserTimeZone: LONDON_TZ,
        viewerTimeZone: AUCKLAND_TZ,
        viewerDate,
        windows: [{ days: [WEEKDAY.monday], startMinutes: 9 * 60, endMinutes: 17 * 60 }],
        stepMinutes: 30,
        notBefore: BOOKING_NOTICE_EPOCH,
      });
      expect(labels.length).toBeGreaterThan(0);
      expect(labels[0]).toMatch(/pm$/);
    },
  );

  test("Adelaide viewer lists full slot labels for a weekday", { tag: ["@unit", "@tz"] }, () => {
    const viewerDate = { year: 2026, month: 10, day: 13 };
    const labels = expectedSlotLabelsForViewerDay({
      organiserTimeZone: LONDON_TZ,
      viewerTimeZone: ADELAIDE_TZ,
      viewerDate,
      windows: [{ days: [WEEKDAY.tuesday], startMinutes: 9 * 60, endMinutes: 17 * 60 }],
      stepMinutes: 30,
      notBefore: BOOKING_NOTICE_EPOCH,
    });
    expect(labels).toEqual(
      expectedSlotEntriesForViewerDay({
        organiserTimeZone: LONDON_TZ,
        viewerTimeZone: ADELAIDE_TZ,
        viewerDate,
        windows: [{ days: [WEEKDAY.tuesday], startMinutes: 9 * 60, endMinutes: 17 * 60 }],
        stepMinutes: 30,
        notBefore: BOOKING_NOTICE_EPOCH,
      }).map((entry) => entry.label),
    );
  });

  test(
    "EU spring-forward Sunday lists Sydney lead-in before organiser midnight",
    {
      tag: ["@unit", "@tz"],
    },
    () => {
      const viewerDate = { year: 2027, month: 3, day: 28 };
      const labels = expectedSlotLabelsForViewerDay({
        organiserTimeZone: LONDON_TZ,
        viewerTimeZone: "Australia/Sydney",
        viewerDate,
        windows: [{ days: [WEEKDAY.sunday], startMinutes: 0, endMinutes: 17 * 60 }],
        stepMinutes: 30,
        notBefore: BOOKING_NOTICE_EPOCH,
      });
      expect(labels.slice(0, 4)).toEqual(["10:00am", "10:30am", "11:00am", "11:30am"]);
    },
  );

  test("US spring-forward Sunday label list skips phantom hour", { tag: ["@unit", "@tz"] }, () => {
    const viewerDate = { year: 2027, month: 3, day: 14 };
    const labels = expectedSlotLabelsForViewerDay({
      organiserTimeZone: NEW_YORK_TZ,
      viewerTimeZone: NEW_YORK_TZ,
      viewerDate,
      windows: [{ days: [WEEKDAY.sunday], startMinutes: 0, endMinutes: 8 * 60 }],
      stepMinutes: 30,
      notBefore: BOOKING_NOTICE_EPOCH,
    });
    expect(labels.some((label) => label.startsWith("2:"))).toBe(false);
    expect(labels[0]).toBe("12:00am");
  });
});
