/* eslint-disable playwright/no-nth-methods -- Twenty renders virtualised rows and duplicate chips/toasts; the first visible match is the intended one */
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { TwentyPeoplePage } from "../../../src/products/twenty/pages/people.page.js";
import { TwentyRecordPage } from "../../../src/products/twenty/pages/record.page.js";
import { twentyTimeouts } from "../../../src/products/twenty/env.js";
import { TW_VIS002_CHIP_NO_ELLIPSIS_ISSUE } from "../../../src/products/twenty/visual.js";
import { expect, test } from "../../../src/products/twenty/visual-fixtures.js";
import { computedStyleOf, documentScroll, scrollSizeOf } from "../../../src/support/visual/dom.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";

interface CellEl {
  getBoundingClientRect(): { right: number; left: number; width: number };
  closest(selector: string): CellEl | null;
  parentElement: CellEl | null;
  nextElementSibling: CellEl | null;
}

test(
  "P1-TW-VIS-002 a 150-char company name stays inside its People cell and company page",
  { tag: ["@twenty", "@visual"], annotation: { type: "testId", description: "P1-TW-VIS-002" } },
  async ({ page, longCompanyRecords }, testInfo) => {
    onlyOnProjects(testInfo.project.name, ["visual-mobile", "visual-desktop"]);
    test.setTimeout(150_000); // two filtered People loads, a company page, and fixture-created records
    const people = new TwentyPeoplePage(page);
    await people.goto();
    await people.filterNameContains("Chip Probe");
    await expect(people.rows()).toHaveCount(1, { timeout: twentyTimeouts().page });
    // The row renders the chip twice (sticky and scrolling columns); the first is the intended one.
    const chip = people
      .rows()
      .first()
      .getByRole("link", { name: /Longcompany/ })
      .first();
    await expect(chip).toBeVisible();

    // The chip must not run into the next cell.
    const edges = await chip.evaluate((el: CellEl) => {
      const chipRight = el.getBoundingClientRect().right;
      let node: CellEl | null = el.closest("td") ?? el.parentElement;
      for (let i = 0; i < 5 && node !== null; i += 1, node = node.parentElement) {
        const next = node.nextElementSibling;
        if (next !== null && next.getBoundingClientRect().width > 0) {
          return { chipRight, nextLeft: next.getBoundingClientRect().left };
        }
      }
      return { chipRight, nextLeft: Number.POSITIVE_INFINITY };
    });
    expect(edges.chipRight).toBeLessThanOrEqual(edges.nextLeft + 1);
    await chip.hover();
    // The row renders the chip in more than one place; any visible match shows the full name.
    await expect(
      page.getByText(longCompanyRecords.companyName, { exact: true }).first(),
    ).toBeVisible();
    const chipOverflow = await computedStyleOf(chip, "textOverflow");
    const chipSize = await scrollSizeOf(chip);

    // Company page: the header ellipsizes and the page does not scroll sideways.
    const record = new TwentyRecordPage(page);
    await record.goto("company", longCompanyRecords.companyId);
    const name = page.getByText(longCompanyRecords.companyName, { exact: true }).first();
    await expect(name).toBeVisible({ timeout: twentyTimeouts().page });
    expect(await computedStyleOf(name, "textOverflow")).toBe("ellipsis");
    const scroll = await documentScroll(page);
    expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth + 1);

    await people.goto();
    await people.filterNameContains("Chip Probe");
    await expect(chip).toBeVisible({ timeout: twentyTimeouts().page });
    await attachKnownBugEvidence(page, testInfo, {
      issue: TW_VIS002_CHIP_NO_ELLIPSIS_ISSUE,
      observed: {
        chipTextOverflow: chipOverflow,
        chipScrollWidth: chipSize.scrollWidth,
        chipClientWidth: chipSize.clientWidth,
      },
      expected: { chipTextOverflow: "ellipsis" },
    });
    test.fail(true, TW_VIS002_CHIP_NO_ELLIPSIS_ISSUE);
    expect(chipOverflow).toBe("ellipsis");
  },
);
