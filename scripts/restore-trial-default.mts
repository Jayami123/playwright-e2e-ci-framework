import "dotenv/config";
import {
  bulkDeleteTrialQaArtifacts,
  countTrialQaArtifacts,
  setDefaultScheduleByName,
} from "../src/products/cal/db.js";
import { loadConfig } from "../src/products/cal/env.js";
import { WORKING_HOURS_SCHEDULE_NAME } from "../src/products/cal/schedules.js";

async function main(): Promise<void> {
  const { dstEmail } = loadConfig();
  const updated = await setDefaultScheduleByName(dstEmail, WORKING_HOURS_SCHEDULE_NAME);
  console.log(
    `Set ${dstEmail} default schedule to ${WORKING_HOURS_SCHEDULE_NAME} (${String(updated)} row(s)).`,
  );
  const before = await countTrialQaArtifacts(dstEmail);
  console.log(`Trial QA counts before bulk delete: ${JSON.stringify(before)}`);
  const deleted = await bulkDeleteTrialQaArtifacts(dstEmail);
  console.log(`Bulk deleted: ${JSON.stringify(deleted)}`);
  const after = await countTrialQaArtifacts(dstEmail);
  console.log(`Trial QA counts after bulk delete: ${JSON.stringify(after)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
