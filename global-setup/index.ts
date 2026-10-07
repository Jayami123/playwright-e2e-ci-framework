import { getAdapter } from "qa-portfolio-harness";
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

async function warmupCalPages(baseUrl: string): Promise<void> {
  const origin = baseUrl.replace(/\/$/, "").replace("://localhost", "://127.0.0.1");
  for (const path of ["/auth/login", "/pro/30min", "/bookings/upcoming", "/event-types"]) {
    const started = Date.now();
    const status = await getStatus(`${origin}${path}`, 180_000);
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
