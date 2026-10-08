import { createPgClient, getAdapter } from "qa-portfolio-harness";
import { calBaseUrl, skipLiveCal } from "../src/env.js";

async function getStatus(url: string, timeoutMs: number): Promise<number | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const ipv4 = url.replace("://localhost", "://127.0.0.1");
    const response = await fetch(ipv4, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    return response.status;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** First EventType id so warmup can compile the editor route FW-003 navigates to. */
async function warmupEventTypeId(): Promise<string | undefined> {
  const fromEnv = process.env.CAL_WARMUP_EVENT_TYPE_ID?.trim();
  if (fromEnv) return fromEnv;
  try {
    const adapter = getAdapter("cal");
    const pool = createPgClient(adapter.dbUrl);
    try {
      const result = await pool.query<{ id: number }>(`SELECT id FROM "EventType" ORDER BY id ASC LIMIT 1`);
      const id = result.rows[0]?.id;
      return id === undefined ? undefined : String(id);
    } finally {
      await pool.end();
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.log(`Warmup event-type id lookup skipped (${detail}); using 1164.`);
    return "1164";
  }
}

async function warmupCalPages(baseUrl: string): Promise<void> {
  const origin = baseUrl.replace(/\/$/, "").replace("://localhost", "://127.0.0.1");
  const paths = ["/auth/login", "/pro/30min", "/bookings/upcoming", "/event-types"];
  const editorId = await warmupEventTypeId();
  if (editorId) {
    paths.push(`/event-types/${editorId}`);
  }
  for (const path of paths) {
    const started = Date.now();
    const timeoutMs = path.includes("/event-types/") && /\/\d+$/.test(path) ? 600_000 : 180_000;
    const status = await getStatus(`${origin}${path}`, timeoutMs);
    console.log(`Warmup ${path} HTTP ${status ?? "fail"} in ${Date.now() - started}ms`);
  }
}

async function csrfStatus(baseUrl: string, timeoutMs: number): Promise<number | undefined> {
  return getStatus(`${baseUrl.replace(/\/$/, "")}/api/auth/csrf`, timeoutMs);
}

export default async function globalSetup(): Promise<void> {
  if (skipLiveCal()) {
    console.log("Skipping Cal health check (CAL_E2E=0 or CI without CAL_E2E_BASE_URL).");
    return;
  }

  process.env.CAL_BASE_URL ??= calBaseUrl();
  process.env.PRODUCTS_ROOT ??= "../products";

  const base = calBaseUrl();
  const already = await csrfStatus(base, 45_000);
  if (already === 200) {
    console.log(`Cal already serving ${base}/api/auth/csrf (HTTP 200); skipping harness up().`);
    await warmupCalPages(base);
    return;
  }

  try {
    const adapter = getAdapter("cal");
    await adapter.up();
    const deadline = Date.now() + 180_000;
    let status = await csrfStatus(adapter.baseUrl, 60_000);
    while (status !== 200 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      status = await csrfStatus(adapter.baseUrl, 60_000);
    }
    if (status !== 200) {
      throw new Error(`GET /api/auth/csrf last status ${status ?? "unreachable"}`);
    }
    console.log(`Cal healthy at ${adapter.baseUrl} (${adapter.productRoot})`);
    await warmupCalPages(adapter.baseUrl);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cal did not become healthy. From qa-portfolio-harness run: node scripts/up.mjs cal\n${detail}`,
    );
  }
}
