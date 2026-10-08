import { getAdapter } from "qa-portfolio-harness";
import { normalizeOrigin } from "../src/core/config.js";
import { firstEventTypeId } from "../src/products/cal/db.js";
import { loadConfig, skipLiveCal, timeouts } from "../src/products/cal/env.js";
import {
  CAL_ROUTES,
  isEventTypeEditorPath,
  PRO_THIRTY_MIN_SLUG,
} from "../src/products/cal/routes.js";

async function getStatus(url: string, timeoutMs: number): Promise<number | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(normalizeOrigin(url), {
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
  const origin = normalizeOrigin(baseUrl);
  const paths = [
    CAL_ROUTES.login,
    CAL_ROUTES.publicBooker(PRO_THIRTY_MIN_SLUG.user, PRO_THIRTY_MIN_SLUG.event),
    CAL_ROUTES.bookingsUpcoming,
    CAL_ROUTES.eventTypes,
  ];
  if (loadConfig().webMode === "dev") {
    const editorId = await firstEventTypeId();
    if (editorId !== undefined) {
      paths.push(CAL_ROUTES.eventTypeEditor(editorId));
    }
  }
  for (const path of paths) {
    const started = Date.now();
    const timeoutMs = isEventTypeEditorPath(path) ? timeouts().warmupEditor : timeouts().warmup;
    const status = await getStatus(`${origin}${path}`, timeoutMs);
    console.log(
      `Warmup ${path} HTTP ${status === undefined ? "fail" : String(status)} in ${String(Date.now() - started)}ms`,
    );
  }
}

async function csrfStatus(baseUrl: string, timeoutMs: number): Promise<number | undefined> {
  return getStatus(`${normalizeOrigin(baseUrl)}${CAL_ROUTES.csrf}`, timeoutMs);
}

export default async function globalSetup(): Promise<void> {
  if (skipLiveCal()) {
    console.log("Skipping Cal health check (CAL_E2E=0 or CI without CAL_E2E_BASE_URL).");
    return;
  }

  const config = loadConfig();
  process.env.CAL_BASE_URL ??= config.baseUrl;
  process.env.PRODUCTS_ROOT ??= config.productsRoot;

  const already = await csrfStatus(config.baseUrl, timeouts().csrf);
  if (already === 200) {
    console.log(
      `Cal already serving ${config.baseUrl}${CAL_ROUTES.csrf} (HTTP 200); skipping harness up().`,
    );
    await warmupCalPages(config.baseUrl);
    return;
  }

  try {
    const adapter = getAdapter("cal");
    await adapter.up();
    const deadline = Date.now() + timeouts().upDeadline;
    let status = await csrfStatus(adapter.baseUrl, timeouts().csrf);
    while (status !== 200 && Date.now() < deadline) {
      await new Promise((resolve) => {
        setTimeout(resolve, timeouts().healthPoll);
      });
      status = await csrfStatus(adapter.baseUrl, timeouts().csrf);
    }
    if (status !== 200) {
      throw new Error(
        `GET ${CAL_ROUTES.csrf} last status ${status === undefined ? "unreachable" : String(status)}`,
      );
    }
    console.log(`Cal healthy at ${adapter.baseUrl} (${adapter.productRoot})`);
    await warmupCalPages(adapter.baseUrl);
  } catch (error) {
    throw new Error(
      "Cal did not become healthy. From qa-portfolio-harness run: node scripts/up.mjs cal",
      { cause: error },
    );
  }
}
