import "dotenv/config";
import { countTrialQaArtifacts } from "../src/products/cal/db.js";
import { loadConfig } from "../src/products/cal/env.js";

async function main(): Promise<void> {
  const { dstEmail } = loadConfig();
  const counts = await countTrialQaArtifacts(dstEmail);
  console.log(JSON.stringify(counts, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
