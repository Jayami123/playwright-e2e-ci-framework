import { expect, test } from "../../../src/products/cal/fixtures.js";
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { CAL_SLOTS_ROUTE } from "../../../src/products/cal/routes.js";
import { CAL_TEST_IDS } from "../../../src/products/cal/testIds.js";
import { VIS004_SLOTS_500_ISSUE } from "../../../src/products/cal/visual.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";

test.describe("Cal slots failure", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test(
    "P1-CAL-VIS-004 a slots HTTP 500 shows a user-facing error",
    { tag: ["@cal", "@visual"], annotation: { type: "testId", description: "P1-CAL-VIS-004" } },
    async ({ page, booker }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      let hits = 0;
      await page.route(CAL_SLOTS_ROUTE, async (route) => {
        hits += 1;
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify([
            {
              error: {
                json: {
                  message: "P1 mocked failure",
                  code: -32603,
                  data: {
                    code: "INTERNAL_SERVER_ERROR",
                    httpStatus: 500,
                    path: "slots.getSchedule",
                  },
                },
              },
            },
          ]),
        });
      });
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      await booker.gotoProThirtyMin();
      await booker.expectLoaded();
      await expect.poll(() => hits, { timeout: 15_000 }).toBeGreaterThan(0);
      // Precondition (hard): retries finish and the calendar settles (Step 0: days render by ~16 s, none enabled)
      await expect(page.getByTestId(CAL_TEST_IDS.day).filter({ hasText: /^14/ })).toBeVisible({
        timeout: 40_000,
      });
      await expect(booker.slotButtons()).toHaveCount(0);
      const alerts = page
        .getByRole("alert")
        .filter({ hasText: /error|wrong|try again|unable|failed/i });
      await attachKnownBugEvidence(page, testInfo, {
        issue: VIS004_SLOTS_500_ISSUE,
        observed: {
          hits,
          alerts: await alerts.count(),
          month: await page.getByTestId(CAL_TEST_IDS.selectedMonthLabel).innerText(),
          search: new URL(page.url()).search,
        },
        expected: { alerts: 1, month: "January 2030" },
      });
      test.fail(true, VIS004_SLOTS_500_ISSUE);
      // Count, not toBeVisible on a filtered locator that may match 0 nodes: the failure then states 0 vs 1.
      await expect(alerts, "slots failure must show exactly one user-facing error").toHaveCount(1, {
        timeout: 10_000,
      });
    },
  );
});
