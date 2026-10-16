import fs from "node:fs";
import { getAdapter } from "qa-portfolio-harness";
import { getStatus } from "../src/core/http-status.js";
import { loadMedusaConfig, MEDUSA_ROUTES, MEDUSA_TIMEOUTS } from "../src/products/medusa/env.js";
import { sweepMedusaQaRecords } from "../src/products/medusa/sweep.js";

async function healthStatus(baseUrl: string, timeoutMs: number): Promise<number | undefined> {
  return getStatus(`${baseUrl}${MEDUSA_ROUTES.health}`, timeoutMs);
}

async function waitForHealth(baseUrl: string, deadlineMs: number): Promise<void> {
  let status = await healthStatus(baseUrl, MEDUSA_TIMEOUTS.request);
  while (status !== 200 && Date.now() < deadlineMs) {
    await new Promise((resolve) => {
      setTimeout(resolve, MEDUSA_TIMEOUTS.healthPoll);
    });
    status = await healthStatus(baseUrl, MEDUSA_TIMEOUTS.request);
  }
  if (status !== 200) {
    throw new Error(
      `GET ${MEDUSA_ROUTES.health} last status ${status === undefined ? "unreachable" : String(status)}`,
    );
  }
}

export default async function medusaGlobalSetup(): Promise<void> {
  process.env.MEDUSA_SKIP_STOREFRONT ??= "1";
  const config = loadMedusaConfig();
  process.env.PRODUCTS_ROOT ??= config.productsRoot;

  const adapter = getAdapter("medusa");
  const deadline = Date.now() + MEDUSA_TIMEOUTS.upDeadline;

  const already = await healthStatus(config.baseUrl, MEDUSA_TIMEOUTS.request);
  if (already === 200) {
    console.log(
      `Medusa already serving ${config.baseUrl}${MEDUSA_ROUTES.health} (HTTP 200); skipping harness up().`,
    );
  } else {
    try {
      await adapter.up();
      await waitForHealth(config.baseUrl, deadline);
      console.log(`Medusa healthy at ${config.baseUrl} (${adapter.productRoot})`);
    } catch (error) {
      throw new Error(
        "Medusa did not become healthy. From qa-portfolio-harness run: node scripts/up.mjs medusa",
        { cause: error },
      );
    }
  }

  const seedStartMs = Date.now();
  const seedStartIso = new Date(seedStartMs).toISOString();
  console.log(`Medusa seed start ${seedStartIso}`);
  await adapter.seed();
  const seedEndMs = Date.now();
  const seedEndIso = new Date(seedEndMs).toISOString();
  const seedSeconds = Math.round((seedEndMs - seedStartMs) / 1000);
  console.log(`Medusa seed end ${seedEndIso} (${String(seedSeconds)}s)`);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath !== undefined && summaryPath !== "") {
    const block = [
      "",
      "### Medusa seed",
      "",
      `- start: ${seedStartIso}`,
      `- end: ${seedEndIso}`,
      `- seconds: ${String(seedSeconds)}`,
      "",
    ].join("\n");
    fs.appendFileSync(summaryPath, block, "utf8");
  }

  if (!process.env.CI) {
    await sweepMedusaQaRecords("P1-QA-");
  }
}
