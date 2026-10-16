import { sweepMedusaQaRecords } from "../src/products/medusa/sweep.js";

export default async function medusaGlobalTeardown(): Promise<void> {
  if (process.env.CI) {
    return;
  }
  await sweepMedusaQaRecords("P1-QA-");
}
