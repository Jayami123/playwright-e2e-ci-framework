/* eslint-disable playwright/no-nth-methods -- Twenty renders virtualised rows and duplicate chips/toasts; the first visible match is the intended one */
import { TwentySettingsExperiencePage } from "../../../src/products/twenty/pages/settings-experience.page.js";
import { setQaMemberPrefs } from "../../../src/products/twenty/fixtures/qa-member.js";
import { TW_PSEUDO_DATA } from "../../../src/products/twenty/visual.js";
import { expect, test } from "../../../src/products/twenty/visual-fixtures.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";

interface TextEl {
  children: { length: number };
  textContent: string | null;
  getClientRects(): { length: number };
}
interface Root {
  querySelectorAll(selector: string): ArrayLike<TextEl>;
}

/** Visible leaf elements' text under each matched root. */
function leafTexts(roots: readonly Root[]): string[][] {
  return roots.map((root) =>
    Array.from(root.querySelectorAll("*"))
      .filter((el) => el.children.length === 0 && el.getClientRects().length > 0)
      .map((el) => (el.textContent ?? "").trim())
      .filter((t) => t !== ""),
  );
}

test(
  "P1-TW-I18N-002 pseudo-en is not in the picker and leaves no plain-English UI strings",
  { tag: ["@twenty", "@visual"], annotation: { type: "testId", description: "P1-TW-I18N-002" } },
  async ({ page, twentyQaMember }, testInfo) => {
    onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
    const settings = new TwentySettingsExperiencePage(page);
    await settings.goto();

    // pseudo-en is dev-only in source: the picker offers no "Pseudo-English" (Step 0: 33 languages).
    await settings.languagePicker().first().click();
    await settings.languageSearch().fill("Pseudo-English");
    await expect(settings.languageOption("Pseudo-English")).toHaveCount(0);

    // Set it through the API (the fixture resets the locale afterwards) and reload.
    await setQaMemberPrefs(twentyQaMember, { locale: "pseudo-en" });
    await page.reload({ waitUntil: "domcontentloaded" });
    // Wait until pseudo strings render (the catalog loads after the reload), not just any heading.
    await expect(page.getByText(/[ƀ-ɏ]/).first()).toBeVisible({ timeout: 30_000 });

    const texts = [
      ...(await page.getByRole("navigation").evaluateAll(leafTexts)),
      ...(await page.getByRole("main").evaluateAll(leafTexts)),
    ].flat();
    const plainEnglish = [...new Set(texts)].filter(
      (t) => /^[A-Za-z][A-Za-z ,.'&-]{2,}$/.test(t) && !TW_PSEUDO_DATA.includes(t),
    );
    await testInfo.attach("pseudo-findings.json", {
      body: `${JSON.stringify({ checked: texts.length, plainEnglish }, null, 2)}\n`,
      contentType: "application/json",
    });
    expect(plainEnglish).toEqual([]);
  },
);
