import { expect, test } from "@playwright/test";
import {
  formatPlaywrightJobSummary,
  parsePlaywrightJsonReport,
} from "../../src/core/playwright-json-summary.js";

const sampleReport = {
  suites: [
    {
      title: "tests/cal/tz-i18n/dst.spec.ts",
      specs: [
        {
          title: "P1-CAL-DST-001 Spring-forward day shows no phantom slot",
          tests: [{ status: "expected", expectedStatus: "passed", annotations: [] }],
        },
        {
          title: "P1-CAL-DST-002 Fall-back day: the duplicated hour is unambiguous",
          tests: [
            {
              status: "expected",
              expectedStatus: "failed",
              annotations: [
                {
                  type: "issue",
                  description:
                    "P7-OBS-CAL-DST-002: both 01:30 instants listed, POST /api/book/event 409",
                },
              ],
            },
          ],
        },
        {
          title: "P1-CAL-DST-003 Cross-hemisphere viewer on DST day",
          tests: [
            {
              status: "expected",
              expectedStatus: "failed",
              annotations: [
                {
                  type: "issue",
                  description: "P7-OBS-CAL-DST-003: organiser slots one hour early",
                },
              ],
            },
          ],
        },
      ],
      suites: [
        {
          title: "nested",
          specs: [
            {
              title: "P1-CAL-TZ-003 Half-hour and 45-minute offsets (Asia/Kathmandu)",
              tests: [
                {
                  status: "expected",
                  expectedStatus: "failed",
                  annotations: [
                    {
                      type: "issue",
                      description: "P7-OBS-CAL-TZ-003: first slot 15 min off organiser grid",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "flaky-and-fail",
      specs: [
        {
          title: "unrelated pass",
          tests: [{ status: "expected", expectedStatus: "passed", annotations: [] }],
        },
        {
          title: "unexpected boom",
          tests: [{ status: "unexpected", expectedStatus: "passed", annotations: [] }],
        },
        {
          title: "flaky once",
          tests: [{ status: "flaky", expectedStatus: "passed", annotations: [] }],
        },
        {
          title: "skipped setup",
          tests: [{ status: "skipped", expectedStatus: "passed", annotations: [] }],
        },
      ],
    },
  ],
};

test.describe("Playwright JSON job summary", () => {
  test("counts passed, failed, flaky, and expected failures", { tag: ["@unit"] }, () => {
    const summary = parsePlaywrightJsonReport(sampleReport);
    expect(summary.totals).toEqual({
      passed: 2,
      failed: 1,
      flaky: 1,
      expectedFailures: 3,
      skipped: 1,
    });
    expect(summary.knownProductBugs.map((row) => `${row.title} (${row.issueId})`)).toEqual([
      "P1-CAL-DST-002 Fall-back day: the duplicated hour is unambiguous (P7-OBS-CAL-DST-002)",
      "P1-CAL-DST-003 Cross-hemisphere viewer on DST day (P7-OBS-CAL-DST-003)",
      "P1-CAL-TZ-003 Half-hour and 45-minute offsets (Asia/Kathmandu) (P7-OBS-CAL-TZ-003)",
    ]);
  });

  test("formats a job summary line from the parsed report", { tag: ["@unit"] }, () => {
    const markdown = formatPlaywrightJobSummary(parsePlaywrightJsonReport(sampleReport));
    expect(markdown).toContain("| 2 | 1 | 1 | 3 |");
    expect(markdown).toContain(
      "Known product bugs still reproducing: P1-CAL-DST-002 (P7-OBS-CAL-DST-002), P1-CAL-DST-003 (P7-OBS-CAL-DST-003), P1-CAL-TZ-003 (P7-OBS-CAL-TZ-003)",
    );
  });

  test("does not list an expected failure that unexpectedly passed", { tag: ["@unit"] }, () => {
    const summary = parsePlaywrightJsonReport({
      suites: [
        {
          specs: [
            {
              title: "P1-CAL-DST-002 Fall-back day: the duplicated hour is unambiguous",
              tests: [
                {
                  status: "unexpected",
                  expectedStatus: "failed",
                  annotations: [
                    {
                      type: "issue",
                      description: "P7-OBS-CAL-DST-002: both 01:30 instants listed",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(summary.totals.failed).toBe(1);
    expect(summary.totals.expectedFailures).toBe(0);
    expect(summary.knownProductBugs).toEqual([]);
    expect(formatPlaywrightJobSummary(summary)).toContain(
      "Known product bugs still reproducing: none",
    );
  });
});
