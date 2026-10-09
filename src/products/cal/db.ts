import { Pool } from "pg";
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
import { MINUTES_TO_MS } from "./schedules.js";

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

export async function withCalPool<T>(
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

export async function withWritableCalPool<T>(run: (pool: Pool) => Promise<T>): Promise<T> {
  // createPgClient sets default_transaction_read_only=on; restore must UPDATE users.
  const adapter = getAdapter("cal");
  const pool = new Pool({
    connectionString: adapter.dbUrl,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
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
       JOIN "Schedule" s
         ON s.id = COALESCE(
           u."defaultScheduleId",
           (SELECT s2.id FROM "Schedule" s2 WHERE s2."userId" = u.id ORDER BY s2.id ASC LIMIT 1)
         )
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

export async function readDefaultScheduleName(email: string): Promise<string> {
  return withCalPool(async (pool) => {
    const result = await pool.query<{ name: string }>(
      `SELECT s.name
       FROM users u
       JOIN "Schedule" s
         ON s.id = COALESCE(
           u."defaultScheduleId",
           (SELECT s2.id FROM "Schedule" s2 WHERE s2."userId" = u.id ORDER BY s2.id ASC LIMIT 1)
         )
       WHERE u.email = $1
       LIMIT 1`,
      [email],
    );
    const name = result.rows[0]?.name;
    if (name === undefined) {
      throw new Error(`No default schedule found for ${email}`);
    }
    return name;
  });
}

export async function setDefaultScheduleByName(
  email: string,
  scheduleName: string,
): Promise<number> {
  return withWritableCalPool(async (pool) => {
    const result = await pool.query(
      `UPDATE users AS u
       SET "defaultScheduleId" = s.id
       FROM "Schedule" AS s
       WHERE u.email = $1
         AND s."userId" = u.id
         AND s.name = $2
         AND s.id = (
           SELECT s2.id
           FROM "Schedule" AS s2
           WHERE s2."userId" = u.id AND s2.name = $2
           ORDER BY s2.id ASC
           LIMIT 1
         )`,
      [email, scheduleName],
    );
    const updated = result.rowCount ?? 0;
    if (updated === 0) {
      throw new Error(
        `setDefaultScheduleByName updated 0 rows (email=${email}, schedule=${scheduleName})`,
      );
    }
    return updated;
  });
}

export async function readScheduleEditorPathByName(
  email: string,
  scheduleName: string,
): Promise<string> {
  return withCalPool(async (pool) => {
    const result = await pool.query<{ id: number }>(
      `SELECT s.id
       FROM "Schedule" s
       JOIN users u ON s."userId" = u.id
       WHERE u.email = $1 AND s.name = $2
       ORDER BY s.id ASC
       LIMIT 1`,
      [email, scheduleName],
    );
    const id = result.rows[0]?.id;
    if (id === undefined) {
      throw new Error(`No schedule named "${scheduleName}" for ${email}`);
    }
    return `/availability/${String(id)}`;
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

export async function organiserHasBusyTimeBetween(
  email: string,
  rangeStartUtc: Date,
  rangeEndUtc: Date,
): Promise<boolean> {
  return withCalPool(async (pool) => {
    const bookingResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM "Booking" b
       JOIN users u ON b."userId" = u.id
       WHERE u.email = $1
         AND b.status IN ('accepted', 'pending')
         AND b."startTime" >= $2
         AND b."startTime" < $3`,
      [email, rangeStartUtc.toISOString(), rangeEndUtc.toISOString()],
    );
    const bookingCount = bookingResult.rows[0]?.count;
    if (bookingCount === undefined) {
      throw new Error("Booking count query returned no row");
    }
    const slotResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM "SelectedSlots" ss
       JOIN users u ON ss."userId" = u.id
       WHERE u.email = $1
         AND ss."releaseAt" > NOW()
         AND ss."slotUtcStartDate" >= $2
         AND ss."slotUtcStartDate" < $3`,
      [email, rangeStartUtc.toISOString(), rangeEndUtc.toISOString()],
    );
    const slotCount = slotResult.rows[0]?.count;
    if (slotCount === undefined) {
      throw new Error("SelectedSlots count query returned no row");
    }
    return Number(bookingCount) > 0 || Number(slotCount) > 0;
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
  return new Date(Date.now() + minimumBookingNoticeMinutes * MINUTES_TO_MS);
}

export async function firstViewerWeekdayWithoutBusyTime(options: {
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
    const blocked = await organiserHasBusyTimeBetween(options.organiserEmail, startUtc, endUtc);
    if (!blocked) {
      return cursor;
    }
    cursor = addDays(cursor, 1);
  }
  throw new Error(
    `No weekday without organiser busy time (bookings or held slots) within ${String(options.maxAttempts)} attempts from lead ${String(options.minLeadDays)}`,
  );
}

export const TRIAL_QA_SCHEDULE_NAME_PREFIX = "sch-qa-" as const;
export const TRIAL_QA_EVENT_TITLE_PREFIX = "qa-" as const;

export interface TrialQaArtifactCounts {
  readonly schQaSchedules: number;
  readonly qaEventTypes: number;
  readonly qaEventTypesOnSchQaSchedules: number;
  readonly orphanedAvailability: number;
}

export interface TrialQaBulkDeleteCounts {
  readonly availabilityRows: number;
  readonly schedules: number;
  readonly eventTypes: number;
  readonly bookings: number;
}

export interface IsolatedSundayTeardownIds {
  readonly email: string;
  readonly scheduleId: number;
  readonly eventTypeId: number;
}

interface TrialUserRow {
  readonly id: number;
  readonly defaultScheduleId: number | null;
}

async function readTrialUserRow(pool: Pool, email: string): Promise<TrialUserRow> {
  const result = await pool.query<{ id: number; default_schedule_id: number | null }>(
    `SELECT id, "defaultScheduleId" AS default_schedule_id FROM users WHERE email = $1 LIMIT 1`,
    [email],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error(`No user row for email=${email}`);
  }
  return { id: row.id, defaultScheduleId: row.default_schedule_id };
}

function assertNotDefaultSchedule(
  scheduleId: number,
  defaultScheduleId: number | null,
  context: string,
): void {
  if (defaultScheduleId !== null && scheduleId === defaultScheduleId) {
    throw new Error(`${context}: refused to delete defaultScheduleId=${String(scheduleId)}`);
  }
}

export async function countTrialQaArtifacts(email: string): Promise<TrialQaArtifactCounts> {
  return withCalPool(async (pool) => {
    const schedules = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM "Schedule" s
       JOIN users u ON s."userId" = u.id
       WHERE u.email = $1 AND s.name LIKE $2`,
      [email, `${TRIAL_QA_SCHEDULE_NAME_PREFIX}%`],
    );
    const eventTypes = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM "EventType" et
       JOIN users u ON et."userId" = u.id
       WHERE u.email = $1 AND et.title LIKE $2`,
      [email, `${TRIAL_QA_EVENT_TITLE_PREFIX}%`],
    );
    const linked = await pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT et.id)::text AS count
       FROM "EventType" et
       JOIN users u ON et."userId" = u.id
       JOIN "Availability" a ON a."eventTypeId" = et.id
       JOIN "Schedule" s ON a."scheduleId" = s.id
       WHERE u.email = $1
         AND et.title LIKE $2
         AND s.name LIKE $3`,
      [email, `${TRIAL_QA_EVENT_TITLE_PREFIX}%`, `${TRIAL_QA_SCHEDULE_NAME_PREFIX}%`],
    );
    const orphans = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM "Availability" a
       LEFT JOIN "Schedule" s ON a."scheduleId" = s.id
       WHERE a."scheduleId" IS NOT NULL AND s.id IS NULL`,
    );
    const schQaSchedules = schedules.rows[0]?.count;
    const qaEventTypes = eventTypes.rows[0]?.count;
    const qaEventTypesOnSchQaSchedules = linked.rows[0]?.count;
    const orphanedAvailability = orphans.rows[0]?.count;
    if (
      schQaSchedules === undefined ||
      qaEventTypes === undefined ||
      qaEventTypesOnSchQaSchedules === undefined ||
      orphanedAvailability === undefined
    ) {
      throw new Error("Trial QA count query returned no row");
    }
    return {
      schQaSchedules: Number(schQaSchedules),
      qaEventTypes: Number(qaEventTypes),
      qaEventTypesOnSchQaSchedules: Number(qaEventTypesOnSchQaSchedules),
      orphanedAvailability: Number(orphanedAvailability),
    };
  });
}

const QA_BOOKING_ATTENDEE_EMAIL_LIKE = "qa-%@qa.local" as const;

export async function countCalQaBookings(): Promise<number> {
  return withCalPool(async (pool) => {
    const result = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM "Booking" b
       JOIN "Attendee" a ON a."bookingId" = b.id
       WHERE a.email LIKE $1 AND b.status IN ('accepted', 'pending')`,
      [QA_BOOKING_ATTENDEE_EMAIL_LIKE],
    );
    const count = result.rows[0]?.count;
    if (count === undefined) {
      throw new Error("countCalQaBookings query returned no row");
    }
    return count;
  });
}

export async function readScheduleIdByName(email: string, scheduleName: string): Promise<number> {
  return withCalPool(async (pool) => {
    const result = await pool.query<{ id: number }>(
      `SELECT s.id
       FROM "Schedule" s
       JOIN users u ON s."userId" = u.id
       WHERE u.email = $1 AND s.name = $2
       ORDER BY s.id ASC
       LIMIT 1`,
      [email, scheduleName],
    );
    const id = result.rows[0]?.id;
    if (id === undefined) {
      throw new Error(`No schedule named "${scheduleName}" for ${email}`);
    }
    return id;
  });
}

export async function readEventTypeIdByTitle(email: string, title: string): Promise<number> {
  return withCalPool(async (pool) => {
    const result = await pool.query<{ id: number }>(
      `SELECT et.id
       FROM "EventType" et
       JOIN users u ON et."userId" = u.id
       WHERE u.email = $1 AND et.title = $2
       ORDER BY et.id ASC
       LIMIT 1`,
      [email, title],
    );
    const id = result.rows[0]?.id;
    if (id === undefined) {
      throw new Error(`No event type titled "${title}" for ${email}`);
    }
    return id;
  });
}

async function deleteEventTypeByIdInPool(
  pool: Pool,
  userId: number,
  eventTypeId: number,
): Promise<{ readonly bookings: number; readonly eventTypes: number }> {
  const bookings = await pool.query(
    `DELETE FROM "Booking" b
     USING "EventType" et
     WHERE b."eventTypeId" = et.id
       AND et.id = $1
       AND et."userId" = $2`,
    [eventTypeId, userId],
  );
  await pool.query(`DELETE FROM "Availability" WHERE "eventTypeId" = $1`, [eventTypeId]);
  await pool.query(`DELETE FROM "Host" WHERE "eventTypeId" = $1`, [eventTypeId]);
  const eventTypes = await pool.query(`DELETE FROM "EventType" WHERE id = $1 AND "userId" = $2`, [
    eventTypeId,
    userId,
  ]);
  const deletedEventTypes = eventTypes.rowCount ?? 0;
  if (deletedEventTypes !== 1) {
    throw new Error(
      `deleteEventTypeById expected 1 EventType row, deleted ${String(deletedEventTypes)} (id=${String(eventTypeId)}, userId=${String(userId)})`,
    );
  }
  return { bookings: bookings.rowCount ?? 0, eventTypes: deletedEventTypes };
}

async function deleteScheduleWithAvailabilityInPool(
  pool: Pool,
  userId: number,
  scheduleId: number,
  defaultScheduleId: number | null,
): Promise<{ readonly availabilityRows: number; readonly schedules: number }> {
  assertNotDefaultSchedule(scheduleId, defaultScheduleId, "deleteScheduleWithAvailabilityInPool");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const availability = await client.query(
      `DELETE FROM "Availability" a
       USING "Schedule" s
       WHERE a."scheduleId" = s.id
         AND s.id = $1
         AND s."userId" = $2`,
      [scheduleId, userId],
    );
    const schedules = await client.query(`DELETE FROM "Schedule" WHERE id = $1 AND "userId" = $2`, [
      scheduleId,
      userId,
    ]);
    const deletedSchedules = schedules.rowCount ?? 0;
    if (deletedSchedules !== 1) {
      throw new Error(
        `deleteScheduleWithAvailability expected 1 Schedule row, deleted ${String(deletedSchedules)} (scheduleId=${String(scheduleId)}, userId=${String(userId)})`,
      );
    }
    await client.query("COMMIT");
    return {
      availabilityRows: availability.rowCount ?? 0,
      schedules: deletedSchedules,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function teardownIsolatedSundayEventInDb(
  ids: IsolatedSundayTeardownIds,
): Promise<TrialQaBulkDeleteCounts> {
  return withWritableCalPool(async (pool) => {
    const user = await readTrialUserRow(pool, ids.email);
    assertNotDefaultSchedule(
      ids.scheduleId,
      user.defaultScheduleId,
      "teardownIsolatedSundayEventInDb",
    );
    const eventType = await deleteEventTypeByIdInPool(pool, user.id, ids.eventTypeId);
    const schedule = await deleteScheduleWithAvailabilityInPool(
      pool,
      user.id,
      ids.scheduleId,
      user.defaultScheduleId,
    );
    return {
      availabilityRows: schedule.availabilityRows,
      schedules: schedule.schedules,
      eventTypes: eventType.eventTypes,
      bookings: eventType.bookings,
    };
  });
}

export async function bulkDeleteTrialQaArtifacts(email: string): Promise<TrialQaBulkDeleteCounts> {
  return withWritableCalPool(async (pool) => {
    const user = await readTrialUserRow(pool, email);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const bookings = await client.query(
        `DELETE FROM "Booking" b
         USING "EventType" et, users u
         WHERE b."eventTypeId" = et.id
           AND et."userId" = u.id
           AND u.email = $1
           AND et.title LIKE $2`,
        [email, `${TRIAL_QA_EVENT_TITLE_PREFIX}%`],
      );
      await client.query(
        `DELETE FROM "Availability" a
         USING "EventType" et, users u
         WHERE a."eventTypeId" = et.id
           AND et."userId" = u.id
           AND u.email = $1
           AND et.title LIKE $2`,
        [email, `${TRIAL_QA_EVENT_TITLE_PREFIX}%`],
      );
      await client.query(
        `DELETE FROM "Host" h
         USING "EventType" et, users u
         WHERE h."eventTypeId" = et.id
           AND et."userId" = u.id
           AND u.email = $1
           AND et.title LIKE $2`,
        [email, `${TRIAL_QA_EVENT_TITLE_PREFIX}%`],
      );
      const eventTypes = await client.query(
        `DELETE FROM "EventType" et
         USING users u
         WHERE et."userId" = u.id
           AND u.email = $1
           AND et.title LIKE $2`,
        [email, `${TRIAL_QA_EVENT_TITLE_PREFIX}%`],
      );
      const availabilityOnSchedules = await client.query(
        `DELETE FROM "Availability" a
         USING "Schedule" s, users u
         WHERE a."scheduleId" = s.id
           AND s."userId" = u.id
           AND u.email = $1
           AND s.name LIKE $2
           AND ($3::int IS NULL OR s.id <> $3)`,
        [email, `${TRIAL_QA_SCHEDULE_NAME_PREFIX}%`, user.defaultScheduleId],
      );
      const schedules = await client.query(
        `DELETE FROM "Schedule" s
         USING users u
         WHERE s."userId" = u.id
           AND u.email = $1
           AND s.name LIKE $2
           AND ($3::int IS NULL OR s.id <> $3)`,
        [email, `${TRIAL_QA_SCHEDULE_NAME_PREFIX}%`, user.defaultScheduleId],
      );
      await client.query("COMMIT");
      return {
        bookings: bookings.rowCount ?? 0,
        eventTypes: eventTypes.rowCount ?? 0,
        availabilityRows: availabilityOnSchedules.rowCount ?? 0,
        schedules: schedules.rowCount ?? 0,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
