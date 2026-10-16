/* eslint-disable playwright/no-nth-methods -- Twenty renders virtualised rows and duplicate chips/toasts; the first visible match is the intended one */
import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import { TwentyPeoplePage } from "../../../src/products/twenty/pages/people.page.js";
import { TwentySettingsExperiencePage } from "../../../src/products/twenty/pages/settings-experience.page.js";
import { twentyTimeouts } from "../../../src/products/twenty/env.js";
import { TW_I18N001_HEADER_TRUNCATED_ISSUE } from "../../../src/products/twenty/visual.js";
import { expect, test } from "../../../src/products/twenty/visual-fixtures.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { documentScroll, measureScroll } from "../../../src/support/visual/dom.js";
import { overflowingControls } from "../../../src/support/visual/layout.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";

test.describe("Twenty German locale", () => {
  test.use({ memberPrefs: { locale: "de-DE" } });

  test(
    "P1-TW-I18N-001 People renders in German without clipping and matches the baseline",
    { tag: ["@twenty", "@visual"], annotation: { type: "testId", description: "P1-TW-I18N-001" } },
    async ({ page }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop", "visual-tablet"]);
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      const people = new TwentyPeoplePage(page);
      await people.goto();
      await expect(people.rows().first()).toBeVisible({ timeout: twentyTimeouts().page });
      expect(await page.evaluate<string>("document.documentElement.lang")).toBe("de-DE");
      await expect(page.getByRole("link", { name: "Personen", exact: true })).toBeVisible();
      for (const label of ["Filter", "Sortieren", "Optionen"]) {
        await expect(page.getByRole("button", { name: label, exact: true }).first()).toBeVisible();
      }
      const scroll = await documentScroll(page);
      expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth + 1);
      const buttons = page.getByRole("button").filter({ visible: true });
      // Width only: icon buttons are a few px taller than their box, which is not clipped text.
      const widths = (await measureScroll(buttons)).map((b) => ({ ...b, sh: b.ch }));
      expect(overflowingControls(widths)).toEqual([]);
      // The top bar's Erstellen and chat buttons appear nondeterministically (seen in 1 of 3 runs), so the
      // baseline covers the page below it; the title and German labels are asserted above.
      const viewport = page.viewportSize();
      if (viewport === null) throw new Error("no viewport");
      await stableScreenshot(page, "tw-people-de", {
        mask: maskLocators(page, "twenty"),
        networkIdle: false,
        clip: { x: 0, y: 48, width: viewport.width, height: viewport.height - 48 },
      });

      // Column headers have no role (X05): find truncated ellipsis labels outside rows and the sidebar.
      const truncatedHeaders = await page.evaluate<string[]>(`(() => {
        const out = [];
        for (const el of document.querySelectorAll("*")) {
          if (el.closest("[data-testid^='row-id-']") || el.closest("nav")) continue;
          if (el.children.length > 0) continue;
          const text = (el.textContent ?? "").trim();
          if (text === "") continue;
          if (getComputedStyle(el).textOverflow !== "ellipsis") continue;
          if (el.scrollWidth > el.clientWidth + 1) out.push(text);
        }
        return out;
      })()`);
      await attachKnownBugEvidence(page, testInfo, {
        issue: TW_I18N001_HEADER_TRUNCATED_ISSUE,
        observed: { truncatedHeaders },
        expected: { truncatedHeaders: [] },
      });
      test.fail(true, TW_I18N001_HEADER_TRUNCATED_ISSUE);
      expect(truncatedHeaders).toEqual([]);
    },
  );

  test(
    "P1-TW-VIS-X04 German Settings Experience has no overflow or clipped text",
    { tag: ["@twenty", "@visual"], annotation: { type: "testId", description: "P1-TW-VIS-X04" } },
    async ({ page }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      await new TwentySettingsExperiencePage(page).goto();
      await expect
        .poll(() => page.evaluate<string>("document.documentElement.lang"), {
          timeout: twentyTimeouts().page,
        })
        .toBe("de-DE");
      await expect(page.getByRole("button").first()).toBeVisible({
        timeout: twentyTimeouts().page,
      });
      const scroll = await documentScroll(page);
      expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth + 1);
      const controls = page.getByRole("button").filter({ visible: true });
      expect(overflowingControls(await measureScroll(controls))).toEqual([]);
    },
  );
});
