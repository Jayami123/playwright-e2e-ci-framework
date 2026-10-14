import fs from "node:fs";
import { loadTwentyConfig } from "../src/products/twenty/env.js";
import { sweepTwentyQaRecords } from "../src/products/twenty/fixtures/sweep.js";

export default async function twentyGlobalTeardown(): Promise<void> {
  if (process.env.CI) {
    return;
  }
  const config = loadTwentyConfig();
  if (!fs.existsSync(config.authStatePath)) {
    console.log("Local Twenty qa-record sweep skipped: no auth state yet");
    return;
  }
  await sweepTwentyQaRecords("P1-QA-");
}
