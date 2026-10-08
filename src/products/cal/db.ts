import { createPgClient, getAdapter } from "qa-portfolio-harness";

export interface OrganiserAvailability {
  readonly email: string;
  readonly timeZone: string;
  readonly days: readonly number[];
  readonly startClock: string;
  readonly endClock: string;
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
      user_tz: string;
      days: number[];
      startTime: unknown;
      endTime: unknown;
    }>(
      `SELECT u.email, u."timeZone" AS user_tz, a.days, a."startTime", a."endTime"
       FROM users u
       JOIN "Schedule" s ON s."userId" = u.id
       JOIN "Availability" a ON a."scheduleId" = s.id
       WHERE u.email = $1
       ORDER BY s.id ASC
       LIMIT 1`,
      [email],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error(`No schedule/availability found for ${email}`);
    }
    return {
      email: row.email,
      timeZone: row.user_tz,
      days: row.days,
      startClock: clockFromPgTime(row.startTime),
      endClock: clockFromPgTime(row.endTime),
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
