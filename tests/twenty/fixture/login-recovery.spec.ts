import { expect, test } from "@playwright/test";
import { TwentyLoginPage } from "../../../src/products/twenty/pages/login.page.js";

// Browser-backed on purpose: the unit project runs in the lint job, which has no browsers installed.
// Every request is routed, so no Twenty server data is touched.
const STUCK_HTML = "<main><div>Welcome, Apple.</div><div>loader</div></main>";
const READY_HTML = '<main><div>Welcome, Apple.</div><input type="text" /></main>';
// A healthy slow form: the input shows up 300 ms after the title.
const SLOW_HTML = `<main><div>Welcome, Apple.</div><script>setTimeout(() => { const i = document.createElement("input"); i.type = "text"; document.querySelector("main").append(i); }, 300);</script></main>`;

test.describe("TwentyLoginPage.goto recovery", { tag: ["@twenty", "@twenty-fixture"] }, () => {
  test.use({ baseURL: "http://welcome.test", storageState: { cookies: [], origins: [] } });

  test("a stuck loader is reloaded once and then the form is ready", async ({ page }, testInfo) => {
    let loads = 0;
    await page.route("**/welcome", async (route) => {
      loads += 1;
      await route.fulfill({
        contentType: "text/html",
        body: loads === 1 ? STUCK_HTML : READY_HTML,
      });
    });

    await new TwentyLoginPage(page).goto({ formGraceMs: 500 });

    expect(loads).toBe(2);
    expect(testInfo.annotations.filter((a) => a.type === "known-issue")).toHaveLength(1);
  });

  test("a loader that survives the reload fails after exactly one reload", async ({ page }) => {
    let loads = 0;
    await page.route("**/welcome", async (route) => {
      loads += 1;
      await route.fulfill({ contentType: "text/html", body: STUCK_HTML });
    });

    await expect(new TwentyLoginPage(page).goto({ formGraceMs: 500 })).rejects.toThrow(
      /form not ready/,
    );
    expect(loads).toBe(2);
  });

  test("a slow but healthy form is never reloaded", async ({ page }, testInfo) => {
    let loads = 0;
    await page.route("**/welcome", async (route) => {
      loads += 1;
      await route.fulfill({ contentType: "text/html", body: SLOW_HTML });
    });

    await new TwentyLoginPage(page).goto({ formGraceMs: 3_000 });

    expect(loads).toBe(1);
    expect(testInfo.annotations.filter((a) => a.type === "known-issue")).toHaveLength(0);
  });
});
