/* eslint-disable playwright/no-nth-methods -- Twenty renders virtualised rows and duplicate chips/toasts; the first visible match is the intended one */
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { TwentyPeoplePage } from "../../../src/products/twenty/pages/people.page.js";
import {
  TW_PEOPLE_OPERATION,
  TW_VIS004_EMPTY_STATE_ISSUE,
  TW_X01_PARTIAL_DATA_DISCARDED_ISSUE,
  TW_X02_DUPLICATE_TOASTS_ISSUE,
} from "../../../src/products/twenty/visual.js";
import { expect, test } from "../../../src/products/twenty/visual-fixtures.js";
import { containsActiveElement } from "../../../src/support/visual/dom.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";
import type { Page, Route } from "@playwright/test";

const MOCK_ERRORS = [
  { message: "P1 mocked failure", extensions: { code: "INTERNAL_SERVER_ERROR" } },
];

function operationOf(route: Route): string | undefined {
  return (route.request().postDataJSON() as { operationName?: string } | null)?.operationName;
}

/** FindManyPeople answers 200 {data:null, errors}; returns a getter for the request count. */
async function mockPeopleFailure(page: Page): Promise<() => number> {
  let hits = 0;
  await page.route("**/graphql", async (route) => {
    if (operationOf(route) !== TW_PEOPLE_OPERATION) {
      await route.fallback();
      return;
    }
    hits += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: null, errors: MOCK_ERRORS }),
    });
  });
  return () => hits;
}

test.describe("Twenty failed People query", () => {
  test(
    "P1-TW-VIS-004 a failed People query does not claim there are no records",
    { tag: ["@twenty", "@visual"], annotation: { type: "testId", description: "P1-TW-VIS-004" } },
    async ({ page }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      const hits = await mockPeopleFailure(page);
      const people = new TwentyPeoplePage(page);
      await people.goto();
      await expect.poll(hits, { timeout: 15_000 }).toBeGreaterThan(0);
      await expect(people.errorToast().first()).toBeVisible({ timeout: 20_000 });
      await attachKnownBugEvidence(page, testInfo, {
        issue: TW_VIS004_EMPTY_STATE_ISSUE,
        observed: {
          hits: hits(),
          toasts: await people.errorToast().count(),
          emptyState: await people.emptyState().count(),
        },
        expected: { emptyState: 0 },
      });
      test.fail(true, TW_VIS004_EMPTY_STATE_ISSUE);
      await expect(
        people.emptyState(),
        "a failed query must not claim there are no records",
      ).toHaveCount(0);
    },
  );

  test(
    "P1-TW-VIS-X01 rows from a partial response are shown",
    { tag: ["@twenty", "@visual"], annotation: { type: "testId", description: "P1-TW-VIS-X01" } },
    async ({ page }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      let hits = 0;
      let dataRows = 0;
      await page.route("**/graphql", async (route) => {
        if (operationOf(route) !== TW_PEOPLE_OPERATION) {
          await route.fallback();
          return;
        }
        hits += 1;
        const response = await route.fetch();
        const json = (await response.json()) as {
          data?: { people?: { edges?: unknown[] } | null } | null;
        };
        dataRows = json.data?.people?.edges?.length ?? 0;
        await route.fulfill({ response, json: { ...json, errors: MOCK_ERRORS } });
      });
      const people = new TwentyPeoplePage(page);
      await people.goto();
      await expect.poll(() => hits, { timeout: 15_000 }).toBeGreaterThan(0);
      // Precondition (hard): the toast shows and the response carried real rows.
      await expect(people.errorToast().first()).toBeVisible({ timeout: 20_000 });
      expect(dataRows).toBeGreaterThan(0);
      await attachKnownBugEvidence(page, testInfo, {
        issue: TW_X01_PARTIAL_DATA_DISCARDED_ISSUE,
        observed: { rows: await people.rows().count(), dataRowsInResponse: dataRows },
        expected: { rowsMin: 1 },
      });
      test.fail(true, TW_X01_PARTIAL_DATA_DISCARDED_ISSUE);
      await expect(people.rows()).not.toHaveCount(0);
    },
  );

  test(
    "P1-TW-VIS-X02 a failed People query shows exactly one error toast",
    { tag: ["@twenty", "@visual"], annotation: { type: "testId", description: "P1-TW-VIS-X02" } },
    async ({ page }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      const hits = await mockPeopleFailure(page);
      const people = new TwentyPeoplePage(page);
      await people.goto();
      await expect.poll(hits, { timeout: 15_000 }).toBeGreaterThan(0);
      // Precondition (hard): at least one toast; give the retries time to finish (Step 0: three by ~12 s).
      await expect(people.errorToast().first()).toBeVisible({ timeout: 20_000 });
      await expect(people.emptyState()).toBeVisible({ timeout: 20_000 });
      await attachKnownBugEvidence(page, testInfo, {
        issue: TW_X02_DUPLICATE_TOASTS_ISSUE,
        observed: { toasts: await people.errorToast().count(), hits: hits() },
        expected: { toasts: 1 },
      });
      test.fail(true, TW_X02_DUPLICATE_TOASTS_ISSUE);
      await expect(people.errorToast()).toHaveCount(1);
    },
  );

  test(
    "P1-TW-VIS-X03 the error toast is a status and does not take focus",
    { tag: ["@twenty", "@visual"], annotation: { type: "testId", description: "P1-TW-VIS-X03" } },
    async ({ page }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      const hits = await mockPeopleFailure(page);
      const people = new TwentyPeoplePage(page);
      await people.goto();
      await expect.poll(hits, { timeout: 15_000 }).toBeGreaterThan(0);
      const toast = people.errorToast().first();
      await expect(toast).toBeVisible({ timeout: 20_000 });
      await expect(toast).toHaveAttribute("role", "status");
      expect(
        await page.evaluate<boolean>(`!document.activeElement?.closest('[role="status"]')`),
      ).toBe(true);
      let reached = false;
      for (let i = 0; i < 60 && !reached; i += 1) {
        await page.keyboard.press("Tab");
        reached = await containsActiveElement(people.filterButton);
      }
      expect(reached, "Tab should reach Filter within 60 presses").toBe(true);
    },
  );
});
