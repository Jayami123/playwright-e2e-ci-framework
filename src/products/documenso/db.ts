import { Pool } from "pg";
import { loadDocumensoConfig } from "./env.js";

export async function withDocumensoPool<T>(run: (pool: Pool) => Promise<T>): Promise<T> {
  const { dbUrl } = loadDocumensoConfig();
  const pool = new Pool({
    connectionString: dbUrl,
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
