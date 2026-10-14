import { sweepTwentyQaRecords } from "../src/products/twenty/fixtures/sweep.js";

export default async function twentyGlobalTeardown(): Promise<void> {
  if (process.env.CI) {
    return;
  }
  await sweepTwentyQaRecords("P1-QA-");
}
