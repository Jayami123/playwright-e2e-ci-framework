/* eslint-disable playwright/no-nth-methods -- Twenty renders virtualised rows and duplicate chips/toasts; the first visible match is the intended one */
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { twentyTimeouts } from "../../../src/products/twenty/env.js";
import { TwentyPeoplePage } from "../../../src/products/twenty/pages/people.page.js";
import { TW_X05_NO_COLUMNHEADERS_ISSUE } from "../../../src/products/twenty/visual.js";
import { expect, test } from "../../../src/products/twenty/visual-fixtures.js";

test(
  "P1-TW-VIS-X05 the People table exposes columnheader roles",
  { tag: ["@twenty", "@a11y"], annotation: { type: "testId", description: "P1-TW-VIS-X05" } },
  async ({ page }, testInfo) => {
    const people = new TwentyPeoplePage(page);
    await people.goto();
    // Precondition (hard): the table rendered rows.
    await expect(people.rows().first()).toBeVisible({ timeout: twentyTimeouts().page });
    const headers = page.getByRole("columnheader");
    await attachKnownBugEvidence(page, testInfo, {
      issue: TW_X05_NO_COLUMNHEADERS_ISSUE,
      observed: { columnheaders: await headers.count(), rows: await people.rows().count() },
      expected: { columnheadersMin: 1 },
    });
    test.fail(true, TW_X05_NO_COLUMNHEADERS_ISSUE);
    await expect(headers).not.toHaveCount(0);
  },
);
