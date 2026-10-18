/* eslint-disable playwright/no-nth-methods -- Twenty renders duplicate navigation landmarks; the first is the breadcrumb */
import type { Locator, Page } from "@playwright/test";
import { twentyTimeouts } from "../../../src/products/twenty/env.js";
import { setQaMemberPrefs } from "../../../src/products/twenty/fixtures/qa-member.js";
import { TwentyPeoplePage } from "../../../src/products/twenty/pages/people.page.js";
import { TwentyRecordPage } from "../../../src/products/twenty/pages/record.page.js";
import { TwentySettingsExperiencePage } from "../../../src/products/twenty/pages/settings-experience.page.js";
import { expect, test, type RtlPerson } from "../../../src/products/twenty/rtl-fixtures.js";
import { attachAxeReport, axeScan } from "../../../src/support/visual/axe.js";
import type { AxeReport } from "../../../src/support/visual/axe-format.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { documentScroll, measureScroll } from "../../../src/support/visual/dom.js";
import { overflowingControls } from "../../../src/support/visual/layout.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";

const DESKTOP = "visual-desktop";

async function expectDir(page: Page, dir: "rtl" | "ltr", lang: string): Promise<void> {
  // dynamicActivate sets dir and lang after the catalog loads, so a read right after load can be stale.
  await expect
    .poll(() => page.evaluate<string>("document.documentElement.dir"), {
      timeout: twentyTimeouts().page,
    })
    .toBe(dir);
  expect(await page.evaluate<string>("document.documentElement.lang")).toBe(lang);
  expect(await page.evaluate<string>("getComputedStyle(document.body).direction")).toBe(dir);
}

/** Probed at 1440 px only (no overflow, English and Arabic); the narrower viewports keep baselines only. */
async function expectNoClipping(page: Page): Promise<void> {
  const scroll = await documentScroll(page);
  expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth + 1);
  const buttons = page.getByRole("button").filter({ visible: true });
  // Width only: icon buttons are a few px taller than their box, which is not clipped text.
  const widths = (await measureScroll(buttons)).map((b) => ({ ...b, sh: b.ch }));
  expect(overflowingControls(widths)).toEqual([]);
}

async function expectRightOfCentre(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  if (box === null || viewport === null) throw new Error("no box or viewport");
  expect(box.x, "mirrored to the right half").toBeGreaterThan(viewport.width / 2);
}

function idCounts(report: AxeReport): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of report.blocking) {
    counts[entry.id] = (counts[entry.id] ?? 0) + entry.targets.length;
  }
  return counts;
}

const X07_ANNOTATION = [
  { type: "testId", description: "P1-TW-VIS-X07" },
  { type: "priority", description: "P2" },
];

async function openPeople(page: Page, rtlPerson: RtlPerson): Promise<void> {
  const people = new TwentyPeoplePage(page);
  await people.gotoView(rtlPerson.viewId);
  await expect(people.rowById(rtlPerson.id)).toBeVisible({ timeout: twentyTimeouts().page });
}

async function openPerson(page: Page, rtlPerson: RtlPerson): Promise<void> {
  const record = new TwentyRecordPage(page);
  await record.goto("person", rtlPerson.id);
  await expect(record.fieldsWidget).toBeVisible({ timeout: twentyTimeouts().page });
}

async function openSettings(page: Page): Promise<void> {
  await new TwentySettingsExperiencePage(page).goto();
  await expect(page.getByRole("navigation").first()).toBeVisible({
    timeout: twentyTimeouts().page,
  });
}

test.describe("Twenty Arabic RTL", () => {
  test.use({ memberPrefs: { locale: "ar-SA" } });

  test(
    "P1-TW-VIS-X07 Arabic People list mirrors and matches the baseline",
    { tag: ["@twenty", "@visual"], annotation: X07_ANNOTATION },
    async ({ page, rtlPerson }, testInfo) => {
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      await openPeople(page, rtlPerson);
      await expectDir(page, "rtl", "ar-SA");
      if (testInfo.project.name === DESKTOP) {
        // Columns mirror: the Name column sits to the right of the Job Title column.
        const row = new TwentyPeoplePage(page).rowById(rtlPerson.id);
        const name = await row.getByText(/P1-QA-RTL/).boundingBox();
        const job = await row.getByText(rtlPerson.jobTitle).boundingBox();
        if (name === null || job === null) throw new Error("name or job title cell has no box");
        expect(name.x, "Name column right of Job Title column").toBeGreaterThan(job.x);
        await expectNoClipping(page);
      }
      await stableScreenshot(page, "tw-people-ar", {
        mask: maskLocators(page, "twenty"),
        networkIdle: false,
      });
    },
  );

  test(
    "P1-TW-VIS-X07 Arabic person record mirrors and matches the baseline",
    { tag: ["@twenty", "@visual"], annotation: X07_ANNOTATION },
    async ({ page, rtlPerson }, testInfo) => {
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      await openPerson(page, rtlPerson);
      await expectDir(page, "rtl", "ar-SA");
      if (testInfo.project.name === DESKTOP) {
        await expectRightOfCentre(page, new TwentyRecordPage(page).fieldsWidget);
        await expectNoClipping(page);
      }
      await stableScreenshot(page, "tw-person-ar", {
        mask: maskLocators(page, "twenty"),
        networkIdle: false,
      });
    },
  );

  test(
    "P1-TW-VIS-X07 Arabic Settings Experience mirrors and matches the baseline",
    { tag: ["@twenty", "@visual"], annotation: X07_ANNOTATION },
    async ({ page }, testInfo) => {
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      await openSettings(page);
      await expectDir(page, "rtl", "ar-SA");
      if (testInfo.project.name === DESKTOP) {
        await expectRightOfCentre(page, page.getByRole("navigation").first());
        await expectNoClipping(page);
      }
      await stableScreenshot(page, "tw-settings-ar", {
        mask: maskLocators(page, "twenty"),
        networkIdle: false,
      });
    },
  );

  for (const target of ["people", "person", "settings"] as const) {
    test(
      `P1-TW-VIS-X07 Arabic adds no axe violations over English (${target})`,
      { tag: ["@twenty", "@visual"], annotation: X07_ANNOTATION },
      async ({ page, twentyQaMember, rtlPerson }, testInfo) => {
        onlyOnProjects(testInfo.project.name, [DESKTOP]);
        // Two full-page scans (40 to 100 s each with rescans) plus two loads: a named exception to the
        // project timeout (precedent: contrast.a11y.spec.ts).
        test.setTimeout(240_000);
        const open = async (): Promise<void> => {
          if (target === "people") await openPeople(page, rtlPerson);
          else if (target === "person") await openPerson(page, rtlPerson);
          else await openSettings(page);
        };
        const scan = async (): Promise<AxeReport> =>
          (await axeScan(page, { project: testInfo.project.name, allowlist: [], context: "light" }))
            .report;

        await setQaMemberPrefs(twentyQaMember, { locale: "en" });
        await open();
        await expectDir(page, "ltr", "en");
        const english = await scan();
        await attachAxeReport(testInfo, `axe-${target}-en`, english);

        await setQaMemberPrefs(twentyQaMember, { locale: "ar-SA" });
        await page.reload();
        await open();
        await expectDir(page, "rtl", "ar-SA");
        const arabic = await scan();
        await attachAxeReport(testInfo, `axe-${target}-ar`, arabic);
        expect(idCounts(arabic), "Arabic serious/critical axe ids and node counts").toEqual(
          idCounts(english),
        );
      },
    );
  }
});
