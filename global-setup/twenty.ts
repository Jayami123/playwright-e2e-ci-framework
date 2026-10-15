import fs from "node:fs";
import { getAdapter } from "qa-portfolio-harness";
import { getStatus } from "../src/core/http-status.js";
import { normalizeBaseUrl } from "../src/core/config.js";
import { loadTwentyConfig, TWENTY_ROUTES, twentyTimeouts } from "../src/products/twenty/env.js";
import { sweepTwentyQaRecords } from "../src/products/twenty/fixtures/sweep.js";

async function healthzStatus(baseUrl: string, timeoutMs: number): Promise<number | undefined> {
  return getStatus(`${normalizeBaseUrl(baseUrl)}${TWENTY_ROUTES.healthz}`, timeoutMs);
}

async function waitForHealthz(baseUrl: string, deadlineMs: number): Promise<void> {
  const { request, healthPoll } = twentyTimeouts();
  let status = await healthzStatus(baseUrl, request);
  while (status !== 200 && Date.now() < deadlineMs) {
    await new Promise((resolve) => {
      setTimeout(resolve, healthPoll);
    });
    status = await healthzStatus(baseUrl, request);
  }
  if (status !== 200) {
    throw new Error(
      `GET ${TWENTY_ROUTES.healthz} last status ${status === undefined ? "unreachable" : String(status)}`,
    );
  }
}

export default async function twentyGlobalSetup(): Promise<void> {
  const config = loadTwentyConfig();
  process.env.PRODUCTS_ROOT ??= config.productsRoot;
  process.env.TWENTY_BASE_URL ??= config.baseUrl;

  const { upDeadline } = twentyTimeouts();
  const adapter = getAdapter("twenty");
  const deadline = Date.now() + upDeadline;

  const already = await healthzStatus(config.baseUrl, twentyTimeouts().request);
  if (already === 200) {
    console.log(
      `Twenty already serving ${config.baseUrl}${TWENTY_ROUTES.healthz} (HTTP 200); skipping harness up().`,
    );
  } else {
    try {
      await adapter.up();
      await waitForHealthz(adapter.baseUrl, deadline);
      console.log(`Twenty healthy at ${adapter.baseUrl} (${adapter.productRoot})`);
    } catch (error) {
      throw new Error(
        "Twenty did not become healthy. From qa-portfolio-harness run: node scripts/up.mjs twenty",
        { cause: error },
      );
    }
  }

  const seedStartMs = Date.now();
  const seedStartIso = new Date(seedStartMs).toISOString();
  console.log(`Twenty seed start ${seedStartIso}`);
  await adapter.seed();
  const seedEndMs = Date.now();
  const seedEndIso = new Date(seedEndMs).toISOString();
  const seedSeconds = Math.round((seedEndMs - seedStartMs) / 1000);
  console.log(`Twenty seed end ${seedEndIso} (${String(seedSeconds)}s)`);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath !== undefined && summaryPath !== "") {
    const block = [
      "",
      "### Twenty seed",
      "",
      `- start: ${seedStartIso}`,
      `- end: ${seedEndIso}`,
      `- seconds: ${String(seedSeconds)}`,
      "",
    ].join("\n");
    fs.appendFileSync(summaryPath, block, "utf8");
  }

  if (!process.env.CI) {
    if (fs.existsSync(config.authStatePath)) {
      await sweepTwentyQaRecords("P1-QA-");
    } else {
      console.log("Local Twenty qa-record sweep skipped: no auth state yet");
    }
  }
}
