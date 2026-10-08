import { createPgClient, getAdapter } from "qa-portfolio-harness";

export async function firstEventTypeId(): Promise<string | undefined> {
  const fromEnv = process.env.CAL_WARMUP_EVENT_TYPE_ID?.trim();
  if (fromEnv !== undefined && fromEnv !== "") {
    return fromEnv;
  }
  try {
    const adapter = getAdapter("cal");
    const pool = createPgClient(adapter.dbUrl);
    try {
      const result = await pool.query<{ id: number }>(
        `SELECT id FROM "EventType" ORDER BY id ASC LIMIT 1`,
      );
      const id = result.rows[0]?.id;
      return id === undefined ? undefined : String(id);
    } finally {
      await pool.end();
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.log(`Warmup event-type id lookup skipped (${detail}).`);
    return undefined;
  }
}
