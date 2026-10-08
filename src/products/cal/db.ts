import { createPgClient, getAdapter } from "qa-portfolio-harness";
import {
  addDays,
  civilDateFromInstant,
  fromZonedCivil,
  parseClockToMinutes,
  WEEKDAY,
  weekdayOf,
  type CivilDate,
} from "../../core/timezone.js";

export interface AvailabilityRow {
  readonly days: readonly number[];
  readonly startClock: string;
  readonly endClock: string;
}

export interface OrganiserAvailability {
  readonly email: string;
  readonly timeZone: string;
  readonly rows: readonly AvailabilityRow[];
}

export interface EventTypeBookingRules {
  readonly minimumBookingNoticeMinutes: number;
  readonly lengthMinutes: number;
}

async function withCalPool<T>(
  run: (pool: ReturnType<typeof createPgClient>) => Promise<T>,
): Promise<T> {
  const adapter = getAdapter("cal");
  const pool = createPgClient(adapter.dbUrl);
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

export async function firstEventTypeId(): Promise<string | undefined> {
  const fromEnv = process.env.CAL_WARMUP_EVENT_TYPE_ID?.trim();
  if (fromEnv !== undefined && fromEnv !== "") {
    return fromEnv;
  }
  try {
    return await withCalPool(async (pool) => {
      const result = await pool.query<{ id: number }>(
        `SELECT id FROM "EventType" ORDER BY id ASC LIMIT 1`,
      );
      const id = result.rows[0]?.id;
      return id === undefined ? undefined : String(id);
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.log(`Warmup event-type id lookup skipped (${detail}).`);
    return undefined;
  }
}

function clockFromPgTime(value: unknown): string {
  if (typeof value === "string") {
    const match = /^(\d{2}:\d{2}:\d{2})/.exec(value);
    if (match !== null && match[1] !== undefined) {
      return match[1];
    }
    throw new Error(`Unexpected time string from Availability: ${value}`);
  }
  if (value instanceof Date) {
    const hh = String(value.getUTCHours()).padStart(2, "0");
    const mm = String(value.getUTCMinutes()).padStart(2, "0");
    const ss = String(value.getUTCSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  throw new Error(`Unexpected Availability clock type: ${typeof value}`);
}

export async function readOrganiserAvailability(email: string): Promise<OrganiserAvailability> {
  return withCalPool(async (pool) => {
    const result = await pool.query<{
      email: string;
      time_zone: string;
      days: number[];
      startTime: unknown;
      endTime: unknown;
    }>(
      `SELECT u.email,
              COALESCE(s."timeZone", u."timeZone") AS time_zone,
              a.days,
              a."startTime",
              a."endTime"
       FROM users u
       JOIN "Schedule" s ON s.id = u."defaultScheduleId"
       JOIN "Availability" a ON a."scheduleId" = s.id
       WHERE u.email = $1
       ORDER BY a.id ASC`,
      [email],
    );
    const first = result.rows[0];
    if (first === undefined) {
      throw new Error(`No default schedule/availability found for ${email}`);
    }
    return {
      email: first.email,
      timeZone: first.time_zone,
      rows: result.rows.map((row) => ({
        days: row.days,
        startClock: clockFromPgTime(row.startTime),
        endClock: clockFromPgTime(row.endTime),
      })),
    };
  });
}

export async function readEventTypeBookingRules(
  username: string,
  slug: string,
): Promise<EventTypeBookingRules> {
  return withCalPool(async (pool) => {
    const result = await pool.query<{
      minimum_booking_notice: number;
      length: number;
    }>(
      `SELECT et."minimumBookingNotice" AS minimum_booking_notice, et.length
       FROM "EventType" et
       JOIN users u ON et."userId" = u.id
       WHERE u.username = $1 AND et.slug = $2
       LIMIT 1`,
      [username, slug],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error(`No EventType ${username}/${slug}`);
    }
    return {
      minimumBookingNoticeMinutes: row.minimum_booking_notice,
      lengthMinutes: row.length,
    };
  });
}

function parsePgTimestampAsUtc(raw: string): Date {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("Booking startTime text was empty");
  }
  const hasZone = /[zZ]|[+-]\d{2}(:?\d{2})?$/.test(trimmed);
  const iso = hasZone ? trimmed.replace(" ", "T") : `${trimmed.replace(" ", "T")}Z`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Booking startTime is not a date: ${raw}`);
  }
  return parsed;
}

export async function readBookingStartUtc(uid: string): Promise<Date> {
  return withCalPool(async (pool) => {
    const result = await pool.query<{ start_text: string }>(
      `SELECT "startTime"::text AS start_text FROM "Booking" WHERE uid = $1 LIMIT 1`,
      [uid],
    );
    const startText = result.rows[0]?.start_text;
    if (startText === undefined) {
      throw new Error(`No Booking row for uid ${uid}`);
    }
    return parsePgTimestampAsUtc(startText);
  });
}

export async function organiserHasBlockingBookingsBetween(
  email: string,
  rangeStartUtc: Date,
  rangeEndUtc: Date,
): Promise<boolean> {
  return withCalPool(async (pool) => {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM "Booking" b
       JOIN users u ON b."userId" = u.id
       WHERE u.email = $1
         AND b.status IN ('accepted', 'pending')
         AND b."startTime" >= $2
         AND b."startTime" < $3`,
      [email, rangeStartUtc.toISOString(), rangeEndUtc.toISOString()],
    );
    const count = result.rows[0]?.count;
    if (count === undefined) {
      throw new Error("Booking count query returned no row");
    }
    return Number(count) > 0;
  });
}

export function viewerWeekdayUtcRange(
  viewerDate: CivilDate,
  viewerTimeZone: string,
): {
  readonly startUtc: Date;
  readonly endUtc: Date;
} {
  const startUtc = fromZonedCivil(viewerTimeZone, { ...viewerDate, hour: 0, minute: 0 });
  const endUtc = fromZonedCivil(viewerTimeZone, { ...addDays(viewerDate, 1), hour: 0, minute: 0 });
  return { startUtc, endUtc };
}

export function availabilityWindowsFromOrganiser(organiser: OrganiserAvailability): readonly {
  readonly days: readonly number[];
  readonly startMinutes: number;
  readonly endMinutes: number;
}[] {
  return organiser.rows.map((row) => ({
    days: row.days,
    startMinutes: parseClockToMinutes(row.startClock),
    endMinutes: parseClockToMinutes(row.endClock),
  }));
}

export function earliestBookableInstant(minimumBookingNoticeMinutes: number): Date {
  return new Date(Date.now() + minimumBookingNoticeMinutes * 60 * 1000);
}

export async function firstViewerWeekdayWithoutBookings(options: {
  readonly organiserEmail: string;
  readonly viewerTimeZone: string;
  readonly minLeadDays: number;
  readonly maxAttempts: number;
}): Promise<CivilDate> {
  let cursor = civilDateFromInstant(new Date(), options.viewerTimeZone);
  cursor = addDays(cursor, options.minLeadDays);
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const weekday = weekdayOf(cursor, options.viewerTimeZone);
    if (weekday === WEEKDAY.saturday || weekday === WEEKDAY.sunday) {
      cursor = addDays(cursor, 1);
      continue;
    }
    const { startUtc, endUtc } = viewerWeekdayUtcRange(cursor, options.viewerTimeZone);
    const blocked = await organiserHasBlockingBookingsBetween(
      options.organiserEmail,
      startUtc,
      endUtc,
    );
    if (!blocked) {
      return cursor;
    }
    cursor = addDays(cursor, 1);
  }
  throw new Error(
    `No weekday without accepted/pending bookings within ${String(options.maxAttempts)} attempts from lead ${String(options.minLeadDays)}`,
  );
}
