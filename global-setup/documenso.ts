import { getAdapter } from "qa-portfolio-harness";
import { getStatus } from "../src/core/http-status.js";
import { normalizeBaseUrl } from "../src/core/config.js";
import {
  DOCUMENSO_ROUTES,
  documensoTimeouts,
  loadDocumensoConfig,
} from "../src/products/documenso/env.js";
import { countDocumensoQaUsers, sweepDocumensoQaUsers } from "../src/products/documenso/qa-user.js";

async function signinStatus(baseUrl: string, timeoutMs: number): Promise<number | undefined> {
  return getStatus(`${normalizeBaseUrl(baseUrl)}${DOCUMENSO_ROUTES.signin}`, timeoutMs);
}

async function csrfStatus(baseUrl: string, timeoutMs: number): Promise<number | undefined> {
  return getStatus(`${normalizeBaseUrl(baseUrl)}${DOCUMENSO_ROUTES.csrf}`, timeoutMs);
}

async function isDocumensoHealthy(baseUrl: string, timeoutMs: number): Promise<boolean> {
  const signin = await signinStatus(baseUrl, timeoutMs);
  if (signin !== 200) {
    return false;
  }
  const csrf = await csrfStatus(baseUrl, timeoutMs);
  return csrf === 200;
}

async function sweepLocalDocumensoQaUsers(): Promise<void> {
  if (process.env.CI) {
    return;
  }
  const before = await countDocumensoQaUsers();
  const deleted = await sweepDocumensoQaUsers();
  const after = await countDocumensoQaUsers();
  console.log(
    `Local Documenso qa-user sweep (before=${String(before)}, deleted=${String(deleted)}, after=${String(after)})`,
  );
}

async function warmupDocumensoPages(baseUrl: string): Promise<void> {
  const origin = normalizeBaseUrl(baseUrl);
  const paths = [DOCUMENSO_ROUTES.signin, DOCUMENSO_ROUTES.csrf];
  const { request } = documensoTimeouts();
  for (const path of paths) {
    const started = Date.now();
    const status = await getStatus(`${origin}${path}`, request);
    console.log(
      `Warmup ${path} HTTP ${status === undefined ? "fail" : String(status)} in ${String(Date.now() - started)}ms`,
    );
  }
}

export default async function documensoGlobalSetup(): Promise<void> {
  const config = loadDocumensoConfig();
  const { request, upDeadline, healthPoll } = documensoTimeouts();

  const already = await isDocumensoHealthy(config.baseUrl, request);
  if (already) {
    console.log(
      `Documenso already serving ${config.baseUrl}${DOCUMENSO_ROUTES.signin} and ${DOCUMENSO_ROUTES.csrf} (HTTP 200); skipping harness up().`,
    );
    await warmupDocumensoPages(config.baseUrl);
    await sweepLocalDocumensoQaUsers();
    return;
  }

  try {
    const adapter = getAdapter("documenso");
    await adapter.up();
    const deadline = Date.now() + upDeadline;
    let healthy = await isDocumensoHealthy(adapter.baseUrl, request);
    while (!healthy && Date.now() < deadline) {
      await new Promise((resolve) => {
        setTimeout(resolve, healthPoll);
      });
      healthy = await isDocumensoHealthy(adapter.baseUrl, request);
    }
    if (!healthy) {
      throw new Error(
        `GET ${DOCUMENSO_ROUTES.signin} and ${DOCUMENSO_ROUTES.csrf} did not both return HTTP 200 before deadline`,
      );
    }
    console.log(`Documenso healthy at ${adapter.baseUrl} (${adapter.productRoot})`);
    await warmupDocumensoPages(adapter.baseUrl);
    await sweepLocalDocumensoQaUsers();
  } catch (error) {
    throw new Error(
      "Documenso did not become healthy. From qa-portfolio-harness under Node 24 run: node scripts/up.mjs documenso",
      { cause: error },
    );
  }
}
