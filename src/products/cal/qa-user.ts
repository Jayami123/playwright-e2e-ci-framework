import bcrypt from "bcryptjs";
import type { Pool, PoolClient } from "pg";
import { withCalPool, withWritableCalPool } from "./db.js";
import { LONDON_TZ } from "./timezones.js";

const BCRYPT_ROUNDS = 12 as const;
const QA_EMAIL_SUFFIX = "@qa.local" as const;
const QA_EMAIL_LIKE = `qa-%${QA_EMAIL_SUFFIX}` as const;
const WORKING_HOURS = "Working Hours" as const;
const WEEKDAY_AVAILABILITY_ROWS = 5 as const;

export interface CalQaUserRecord {
  readonly id: number;
  readonly email: string;
  readonly username: string;
  readonly name: string;
}

export interface TwoFactorDbState {
  readonly twoFactorEnabled: boolean;
  readonly backupCodesCiphertext: string | null;
}

export interface CreateCalQaUserInput {
  readonly email: string;
  readonly username: string;
  readonly name: string;
  readonly password: string;
}

async function insertUserWithSchedule(
  client: Pool,
  input: CreateCalQaUserInput,
): Promise<CalQaUserRecord> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const dbClient = await client.connect();
  try {
    await dbClient.query("BEGIN");
    const userResult = await dbClient.query<{ id: number }>(
      `INSERT INTO users (
         uuid, email, username, name, "emailVerified", "completedOnboarding", locale, "timeZone", locked
       ) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), true, 'en', $4, false)
       RETURNING id`,
      [input.email, input.username, input.name, LONDON_TZ],
    );
    const userId = userResult.rows[0]?.id;
    if (userId === undefined) {
      throw new Error("createCalQaUser INSERT users returned no id");
    }

    await dbClient.query(`INSERT INTO "UserPassword" ("userId", hash) VALUES ($1, $2)`, [
      userId,
      passwordHash,
    ]);

    const scheduleResult = await dbClient.query<{ id: number }>(
      `INSERT INTO "Schedule" ("userId", name, "timeZone")
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, WORKING_HOURS, LONDON_TZ],
    );
    const scheduleId = scheduleResult.rows[0]?.id;
    if (scheduleId === undefined) {
      throw new Error("createCalQaUser INSERT Schedule returned no id");
    }

    for (const day of [1, 2, 3, 4, 5]) {
      await dbClient.query(
        `INSERT INTO "Availability" ("userId", "scheduleId", days, "startTime", "endTime")
         VALUES ($1, $2, $3, '09:00:00'::time, '17:00:00'::time)`,
        [userId, scheduleId, [day]],
      );
    }

    await dbClient.query(`UPDATE users SET "defaultScheduleId" = $1 WHERE id = $2`, [
      scheduleId,
      userId,
    ]);

    await dbClient.query("COMMIT");
    return { id: userId, email: input.email, username: input.username, name: input.name };
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }
}

export async function createCalQaUser(input: CreateCalQaUserInput): Promise<CalQaUserRecord> {
  return withWritableCalPool((pool) => insertUserWithSchedule(pool, input));
}

export async function readTwoFactorState(userId: number): Promise<TwoFactorDbState> {
  return withCalPool(async (pool) => {
    const result = await pool.query<{
      two_factor_enabled: boolean;
      backup_codes: string | null;
    }>(
      `SELECT "twoFactorEnabled" AS two_factor_enabled, "backupCodes" AS backup_codes
       FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error(`readTwoFactorState: no user id=${String(userId)}`);
    }
    return {
      twoFactorEnabled: row.two_factor_enabled,
      backupCodesCiphertext: row.backup_codes,
    };
  });
}

async function deleteCalQaUserInTransaction(client: PoolClient, userId: number): Promise<void> {
  const availability = await client.query(
    `DELETE FROM "Availability"
     WHERE "userId" = $1
        OR "scheduleId" IN (SELECT id FROM "Schedule" WHERE "userId" = $1)`,
    [userId],
  );
  const schedules = await client.query(`DELETE FROM "Schedule" WHERE "userId" = $1`, [userId]);
  await client.query(`DELETE FROM "Session" WHERE "userId" = $1`, [userId]);
  const deleted = await client.query(`DELETE FROM users WHERE id = $1 RETURNING id`, [userId]);
  if ((deleted.rowCount ?? 0) !== 1) {
    throw new Error(
      `teardownCalQaUserById expected 1 user row, deleted ${String(deleted.rowCount ?? 0)}`,
    );
  }
  const availabilityRows = availability.rowCount ?? 0;
  if (availabilityRows !== WEEKDAY_AVAILABILITY_ROWS) {
    throw new Error(
      `teardownCalQaUserById expected ${String(WEEKDAY_AVAILABILITY_ROWS)} Availability rows, deleted ${String(availabilityRows)}`,
    );
  }
  const scheduleRows = schedules.rowCount ?? 0;
  if (scheduleRows !== 1) {
    throw new Error(
      `teardownCalQaUserById expected 1 Schedule row, deleted ${String(scheduleRows)}`,
    );
  }
}

export async function teardownCalQaUserById(userId: number): Promise<void> {
  await withWritableCalPool(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await deleteCalQaUserInTransaction(client, userId);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function countCalQaUsers(): Promise<number> {
  return withCalPool(async (pool) => {
    const result = await pool.query<{ leftover: number }>(
      `SELECT count(*)::int AS leftover FROM users WHERE email LIKE $1`,
      [QA_EMAIL_LIKE],
    );
    const count = result.rows[0]?.leftover;
    if (count === undefined) {
      throw new Error("countCalQaUsers query returned no row");
    }
    return count;
  });
}

export async function sweepCalQaUsers(): Promise<number> {
  return withWritableCalPool(async (pool) => {
    const client = await pool.connect();
    try {
      const listed = await client.query<{ id: number }>(
        `SELECT id FROM users WHERE email LIKE $1 ORDER BY id ASC`,
        [QA_EMAIL_LIKE],
      );
      await client.query("BEGIN");
      for (const row of listed.rows) {
        await deleteCalQaUserInTransaction(client, row.id);
      }
      await client.query("COMMIT");
      return listed.rows.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
}
