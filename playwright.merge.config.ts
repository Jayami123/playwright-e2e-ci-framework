import { defineConfig } from "@playwright/test";
import { PLAYWRIGHT_JSON_REPORT_FILE } from "./src/core/playwright-json-summary.js";

/** Reporter-only config for `playwright merge-reports` on the live-Cal shard path. */
export default defineConfig({
  reporter: [
    ["html", { open: "never" }],
    ["json", { outputFile: PLAYWRIGHT_JSON_REPORT_FILE }],
  ],
});
