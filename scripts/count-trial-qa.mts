import "dotenv/config";
import { countCalQaBookings, countTrialQaArtifacts } from "../src/products/cal/db.js";
import { loadConfig } from "../src/products/cal/env.js";
import { countCalQaUsers } from "../src/products/cal/qa-user.js";

async function main(): Promise<void> {
  const { dstEmail } = loadConfig();
  const [trial, qaUsers, qaBookings] = await Promise.all([
    countTrialQaArtifacts(dstEmail),
    countCalQaUsers(),
    countCalQaBookings(),
  ]);
  console.log(JSON.stringify({ ...trial, qaUsers, qaBookings }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
