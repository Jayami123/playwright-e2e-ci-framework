import bcrypt from "bcryptjs";
import type { Pool } from "pg";
import { withWritableCalPool } from "./db.js";

const BCRYPT_ROUNDS = 12 as const;
const QA_EMAIL_SUFFIX = "@qa.local" as const;
const WORKING_HOURS = "Working Hours" as const;

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
  const passwordHash = bcrypt.hashSync(input.password, BCRYPT_ROUNDS);
  const dbClient = await client.connect();
  try {
    await dbClient.query("BEGIN");
    const userResult = await dbClient.query<{ id: number }>(
      `INSERT INTO users (
         uuid, email, username, name, "emailVerified", "completedOnboarding", locale, "timeZone", locked
       ) VALUES (gen_random_uuid(), $1, $2, $3, NOW(), true, 'en', 'Europe/London', false)
       RETURNING id`,
      [input.email, input.username, input.name],
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
       VALUES ($1, $2, 'Europe/London')
       RETURNING id`,
      [userId, WORKING_HOURS],
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
  return withWritableCalPool(async (pool) => {
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

export async function teardownCalQaUserById(userId: number): Promise<void> {
  await withWritableCalPool(async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM "Availability"
         WHERE "userId" = $1
            OR "scheduleId" IN (SELECT id FROM "Schedule" WHERE "userId" = $1)`,
        [userId],
      );
      await client.query(`DELETE FROM "Schedule" WHERE "userId" = $1`, [userId]);
      await client.query(`DELETE FROM "Session" WHERE "userId" = $1`, [userId]);
      const deleted = await client.query(`DELETE FROM users WHERE id = $1 RETURNING id`, [userId]);
      if ((deleted.rowCount ?? 0) !== 1) {
        throw new Error(
          `teardownCalQaUserById expected 1 user row, deleted ${String(deleted.rowCount ?? 0)}`,
        );
      }
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
  return withWritableCalPool(async (pool) => {
    const result = await pool.query<{ leftover: number }>(
      `SELECT count(*)::int AS leftover FROM users WHERE email LIKE $1`,
      [`qa-%${QA_EMAIL_SUFFIX}`],
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
    const listed = await pool.query<{ id: number }>(
      `SELECT id FROM users WHERE email LIKE $1 ORDER BY id ASC`,
      [`qa-%${QA_EMAIL_SUFFIX}`],
    );
    for (const row of listed.rows) {
      await teardownCalQaUserById(row.id);
    }
    return listed.rows.length;
  });
}
