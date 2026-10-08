import { expect, test } from "@playwright/test";
import {
  civilDateToIso,
  expectedSlotInstants,
  fromZonedCivil,
  lastWeekdayOfMonth,
  localTimeExists,
  nextEuSpringForward,
  nextUsFallBack,
  nextUsSpringForward,
  nextWeekdayAfter,
  normalizeSlotLabel,
  nthWeekdayOfMonth,
  toZonedLabel,
  WEEKDAY,
} from "../../../src/core/timezone.js";

test.describe("timezone helpers", () => {
  test("computes US and EU DST transition Sundays", { tag: ["@tz"] }, () => {
    expect(civilDateToIso(nthWeekdayOfMonth(2027, 3, WEEKDAY.sunday, 2))).toBe("2027-03-14");
    expect(civilDateToIso(nthWeekdayOfMonth(2026, 11, WEEKDAY.sunday, 1))).toBe("2026-11-01");
    expect(civilDateToIso(lastWeekdayOfMonth(2027, 3, WEEKDAY.sunday))).toBe("2027-03-28");
    expect(civilDateToIso(nextUsSpringForward({ year: 2026, month: 10, day: 8 }))).toBe(
      "2027-03-14",
    );
    expect(civilDateToIso(nextUsFallBack({ year: 2026, month: 10, day: 8 }))).toBe("2026-11-01");
    expect(civilDateToIso(nextEuSpringForward({ year: 2026, month: 10, day: 8 }))).toBe(
      "2027-03-28",
    );
  });

  test("skips today when asking for the next weekday", { tag: ["@tz"] }, () => {
    const friday = { year: 2026, month: 10, day: 9 };
    expect(civilDateToIso(nextWeekdayAfter(friday, "Europe/London", true))).toBe("2026-10-12");
  });

  test("formats viewer labels with Intl, not hard-coded offsets", { tag: ["@tz"] }, () => {
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

  test("spring-forward skips 02:00–02:59 America/New_York", { tag: ["@tz"] }, () => {
    const date = { year: 2027, month: 3, day: 14 };
    expect(localTimeExists("America/New_York", { ...date, hour: 2, minute: 30 })).toBe(false);
    expect(localTimeExists("America/New_York", { ...date, hour: 1, minute: 30 })).toBe(true);
    expect(localTimeExists("America/New_York", { ...date, hour: 3, minute: 0 })).toBe(true);
    const instants = expectedSlotInstants({
      timeZone: "America/New_York",
      date,
      startMinutes: 0,
      endMinutes: 8 * 60,
      stepMinutes: 30,
    });
    expect(instants).toHaveLength(14);
    const labels = instants.map((instant) => toZonedLabel(instant, "America/New_York"));
    expect(labels.some((label) => label.startsWith("2:"))).toBe(false);
  });

  test("fall-back 01:30 has two UTC instants", { tag: ["@tz"] }, () => {
    const date = { year: 2026, month: 11, day: 1 };
    const first = fromZonedCivil("America/New_York", { ...date, hour: 1, minute: 30 });
    const later = new Date(first.getTime() + 60 * 60 * 1000);
    expect(toZonedLabel(first, "America/New_York")).toBe("1:30am");
    expect(toZonedLabel(later, "America/New_York")).toBe("1:30am");
    expect(later.getTime() - first.getTime()).toBe(60 * 60 * 1000);
  });
});
