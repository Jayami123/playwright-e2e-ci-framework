import "dotenv/config";
import fs from "node:fs";
import { sweepTwentyQaRecords } from "../src/products/twenty/fixtures/sweep.js";

async function main(): Promise<void> {
  const result = await sweepTwentyQaRecords("P1-QA-");

  console.log(JSON.stringify(result, null, 2));

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath !== undefined && summaryPath !== "") {
    const block = [
      "",
      "### Twenty QA leak sweep",
      "",
      `- before: ${String(result.before)}`,
      `- deleted: ${String(result.deleted)}`,
      `- after: ${String(result.after)}`,
      `- viewsBefore: ${String(result.viewsBefore)}`,
      `- viewsDeleted: ${String(result.viewsDeleted)}`,
      `- viewsAfter: ${String(result.viewsAfter)}`,
      "",
    ].join("\n");
    fs.appendFileSync(summaryPath, block, "utf8");
  }

  if (result.after > 0 || result.viewsAfter > 0) {
    process.exitCode = 1;
  }
  if (process.env.P1_TWENTY_SWEEP_FAIL_ON_BEFORE === "1" && result.before > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
