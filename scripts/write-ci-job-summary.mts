import { appendFileSync, readFileSync } from "node:fs";
import {
  formatPlaywrightJobSummary,
  parsePlaywrightJsonReport,
  PLAYWRIGHT_JSON_REPORT_FILE,
} from "../src/core/playwright-json-summary.js";

function writeSummary(markdown: string): void {
  process.stdout.write(markdown);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath === undefined || summaryPath.trim() === "") {
    return;
  }
  appendFileSync(summaryPath, markdown, "utf8");
}

function main(): void {
  const jsonPath = process.argv[2] ?? PLAYWRIGHT_JSON_REPORT_FILE;
  let rawText: string;
  try {
    rawText = readFileSync(jsonPath, "utf8");
  } catch {
    writeSummary(
      `## Playwright results\n\nJSON report not found at \`${jsonPath}\`. Known product bugs cannot be listed.\n`,
    );
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new Error(`Playwright JSON report is not valid JSON: ${jsonPath}`, { cause: error });
  }
  writeSummary(formatPlaywrightJobSummary(parsePlaywrightJsonReport(parsed)));
}

try {
  main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
