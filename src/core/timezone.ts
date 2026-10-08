export const WEEKDAY = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
} as const;

export type Weekday = (typeof WEEKDAY)[keyof typeof WEEKDAY];

export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export interface CivilDateTime extends CivilDate {
  readonly hour: number;
  readonly minute: number;
}

const UTC_PARTS = [
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
] as const satisfies readonly Intl.DateTimeFormatPartTypes[];

function intlPart(
  parts: readonly Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  const found = parts.find((part) => part.type === type);
  if (found === undefined) {
    throw new Error(`Intl.DateTimeFormat did not emit part "${type}"`);
  }
  return found.value;
}

function utcFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function partsToUtcMs(parts: readonly Intl.DateTimeFormatPart[]): number {
  const hourRaw = Number(intlPart(parts, "hour"));
  const hour = hourRaw === 24 ? 0 : hourRaw;
  return Date.UTC(
    Number(intlPart(parts, "year")),
    Number(intlPart(parts, "month")) - 1,
    Number(intlPart(parts, "day")),
    hour,
    Number(intlPart(parts, "minute")),
    Number(intlPart(parts, "second")),
  );
}

/** Offset of `timeZone` at `utcMs`: zoned local clock as UTC minus the instant. */
export function timeZoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = utcFormatter(timeZone).formatToParts(new Date(utcMs));
  for (const type of UTC_PARTS) {
    intlPart(parts, type);
  }
  return partsToUtcMs(parts) - utcMs;
}

/**
 * Convert civil wall time in `timeZone` to a UTC `Date`.
 * Non-existent DST times (spring-forward gap) resolve to the post-gap offset.
 */
export function fromZonedCivil(timeZone: string, civil: CivilDateTime): Date {
  const utcGuess = Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute, 0);
  const instantMs = utcGuess - timeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess - timeZoneOffsetMs(instantMs, timeZone));
}

export function zonedCivilOf(instant: Date, timeZone: string): CivilDateTime {
  const parts = utcFormatter(timeZone).formatToParts(instant);
  const hourRaw = Number(intlPart(parts, "hour"));
  return {
    year: Number(intlPart(parts, "year")),
    month: Number(intlPart(parts, "month")),
    day: Number(intlPart(parts, "day")),
    hour: hourRaw === 24 ? 0 : hourRaw,
    minute: Number(intlPart(parts, "minute")),
  };
}

export function civilDateToIso({ year, month, day }: CivilDate): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${String(year)}-${mm}-${dd}`;
}

export function monthParam(date: CivilDate): string {
  return `${String(date.year)}-${String(date.month).padStart(2, "0")}`;
}

function asWeekday(value: number): Weekday {
  if (
    value === WEEKDAY.sunday ||
    value === WEEKDAY.monday ||
    value === WEEKDAY.tuesday ||
    value === WEEKDAY.wednesday ||
    value === WEEKDAY.thursday ||
    value === WEEKDAY.friday ||
    value === WEEKDAY.saturday
  ) {
    return value;
  }
  throw new Error(`Invalid weekday index ${String(value)}`);
}

export function weekdayOf(date: CivilDate, timeZone: string): Weekday {
  const instant = fromZonedCivil(timeZone, { ...date, hour: 12, minute: 0 });
  return asWeekday(instant.getUTCDay());
}

export function addDays(date: CivilDate, days: number): CivilDate {
  const utc = Date.UTC(date.year, date.month - 1, date.day + days);
  const shifted = new Date(utc);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

export function compareCivilDate(left: CivilDate, right: CivilDate): number {
  return civilDateToIso(left).localeCompare(civilDateToIso(right));
}

export function civilDateFromInstant(instant: Date, timeZone: string): CivilDate {
  const zoned = zonedCivilOf(instant, timeZone);
  return { year: zoned.year, month: zoned.month, day: zoned.day };
}

export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: Weekday,
  n: number,
): CivilDate {
  if (n < 1) {
    throw new Error(`nthWeekdayOfMonth n must be >= 1, got ${String(n)}`);
  }
  const first = { year, month, day: 1 };
  const delta = (weekday - weekdayOf(first, "UTC") + 7) % 7;
  const day = 1 + delta + (n - 1) * 7;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > lastDay) {
    throw new Error(
      `No ${String(n)}th weekday ${String(weekday)} in ${String(year)}-${String(month)}`,
    );
  }
  return { year, month, day };
}

export function lastWeekdayOfMonth(year: number, month: number, weekday: Weekday): CivilDate {
  const nextMonth =
    month === 12 ? { year: year + 1, month: 1, day: 1 } : { year, month: month + 1, day: 1 };
  let cursor = addDays(nextMonth, -1);
  while (weekdayOf(cursor, "UTC") !== weekday) {
    cursor = addDays(cursor, -1);
  }
  return cursor;
}

export function nextOccurrenceOnOrAfter(
  from: CivilDate,
  inYear: (year: number) => CivilDate,
): CivilDate {
  const thisYear = inYear(from.year);
  if (compareCivilDate(thisYear, from) >= 0) {
    return thisYear;
  }
  return inYear(from.year + 1);
}

/** 2nd Sunday of March (US spring-forward), next on/after `from`. */
export function nextUsSpringForward(from: CivilDate): CivilDate {
  return nextOccurrenceOnOrAfter(from, (year) => nthWeekdayOfMonth(year, 3, WEEKDAY.sunday, 2));
}

/** 1st Sunday of November (US fall-back), next on/after `from`. */
export function nextUsFallBack(from: CivilDate): CivilDate {
  return nextOccurrenceOnOrAfter(from, (year) => nthWeekdayOfMonth(year, 11, WEEKDAY.sunday, 1));
}

/** Last Sunday of March (EU spring-forward), next on/after `from`. */
export function nextEuSpringForward(from: CivilDate): CivilDate {
  return nextOccurrenceOnOrAfter(from, (year) => lastWeekdayOfMonth(year, 3, WEEKDAY.sunday));
}

export function nextWeekdayAfter(from: CivilDate, timeZone: string, skipToday: boolean): CivilDate {
  let cursor = skipToday ? addDays(from, 1) : from;
  for (let i = 0; i < 14; i += 1) {
    const dow = weekdayOf(cursor, timeZone);
    if (dow !== WEEKDAY.saturday && dow !== WEEKDAY.sunday) {
      return cursor;
    }
    cursor = addDays(cursor, 1);
  }
  throw new Error("Could not find a weekday in the next 14 days");
}

export function minutesSinceMidnight(hour: number, minute: number): number {
  return hour * 60 + minute;
}

export function parseClockToMinutes(clock: string): number {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(clock);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new Error(`Expected HH:MM[:SS] clock, got ${clock}`);
  }
  return minutesSinceMidnight(Number(match[1]), Number(match[2]));
}

/**
 * Slot label matching Cal booker 12-hour `h:mma` (e.g. `9:00am`) via Intl, never hard-coded offsets.
 */
export function toZonedLabel(instant: Date, timeZone: string, locale = "en-US"): string {
  const formatted = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(instant);
  return normalizeSlotLabel(formatted);
}

export function normalizeSlotLabel(label: string): string {
  return label
    .replace(/\u202f/g, " ")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function localTimeExists(timeZone: string, civil: CivilDateTime): boolean {
  const instant = fromZonedCivil(timeZone, civil);
  const roundTrip = zonedCivilOf(instant, timeZone);
  return (
    roundTrip.year === civil.year &&
    roundTrip.month === civil.month &&
    roundTrip.day === civil.day &&
    roundTrip.hour === civil.hour &&
    roundTrip.minute === civil.minute
  );
}

export function expectedSlotInstants(options: {
  readonly timeZone: string;
  readonly date: CivilDate;
  readonly startMinutes: number;
  readonly endMinutes: number;
  readonly stepMinutes: number;
}): readonly Date[] {
  const instants: Date[] = [];
  for (
    let minutes = options.startMinutes;
    minutes < options.endMinutes;
    minutes += options.stepMinutes
  ) {
    const civil: CivilDateTime = {
      ...options.date,
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
    };
    if (localTimeExists(options.timeZone, civil)) {
      instants.push(fromZonedCivil(options.timeZone, civil));
    }
  }
  return instants;
}

export function expectedSlotLabels(
  options: Parameters<typeof expectedSlotInstants>[0] & { readonly viewerTimeZone: string },
): readonly string[] {
  return expectedSlotInstants(options).map((instant) =>
    toZonedLabel(instant, options.viewerTimeZone),
  );
}
