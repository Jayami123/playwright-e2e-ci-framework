import "dotenv/config";
import fs from "node:fs";
import { countMedusaQaLeaks, sweepMedusaQaRecords } from "../src/products/medusa/sweep.js";

async function main(): Promise<void> {
  const result = await sweepMedusaQaRecords("P1-QA-");
  const leaks = await countMedusaQaLeaks();

  console.log(JSON.stringify({ ...result, ...leaks }, null, 2));

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath !== undefined && summaryPath !== "") {
    const block = [
      "",
      "### Medusa QA leak sweep",
      "",
      `- before: ${String(result.before)}`,
      `- deleted: ${String(result.deleted)}`,
      `- after: ${String(result.after)}`,
      `- products: ${String(leaks.products)}`,
      `- options: ${String(leaks.options)}`,
      `- customers: ${String(leaks.customers)}`,
      `- liveOrders: ${String(leaks.liveOrders)}`,
      `- openFulfillments: ${String(leaks.openFulfillments)}`,
      `- archivedOrders (informational): ${String(leaks.archivedOrders)}`,
      `- carts (informational): ${String(leaks.carts)}`,
      "",
    ].join("\n");
    fs.appendFileSync(summaryPath, block, "utf8");
  }

  const mustBeZero = [
    leaks.products,
    leaks.options,
    leaks.customers,
    leaks.liveOrders,
    leaks.openFulfillments,
  ];
  if (result.after > 0 || mustBeZero.some((count) => count > 0)) {
    process.exitCode = 1;
  }
  if (process.env.P1_MEDUSA_SWEEP_FAIL_ON_BEFORE === "1" && result.before > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
