import { attachKnownBugEvidence } from "../../../src/core/known-bug-evidence.js";
import {
  MED_X06_DIALOG_HIDDEN_ISSUE,
  MED_X07_MENU_TRIGGER_NAME_ISSUE,
  MED_X08_LOGIN_ERROR_ISSUE,
  MED_X13_REFLOW_ISSUE,
} from "../../../src/products/medusa/known-issues.js";
import { MedusaLoginPage } from "../../../src/products/medusa/pages/login.page.js";
import { MedusaOrderDetailPage } from "../../../src/products/medusa/pages/order-detail.page.js";
import { MedusaProductsPage } from "../../../src/products/medusa/pages/products.page.js";
import { expect, test } from "../../../src/products/medusa/visual-fixtures.js";
import { containsActiveElement, documentScroll } from "../../../src/support/visual/dom.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";

interface RectEl {
  getAttribute(name: string): string | null;
  getBoundingClientRect(): { right: number };
  id: string;
  tagName: string;
}

test.describe("Medusa admin accessibility", () => {
  test(
    "P1-MED-FW-X06 Create Product dialog is exposed to assistive technology",
    {
      tag: ["@medusa", "@a11y"],
      annotation: [
        { type: "testId", description: "P1-MED-FW-X06" },
        { type: "priority", description: "P2" },
      ],
    },
    async ({ page }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      const products = new MedusaProductsPage(page);
      await products.goto();
      await expect(products.heading).toBeVisible();
      await products.openCreate();
      await expect(products.createDialogsIncludingHidden).toHaveCount(2);
      await expect(products.title).toBeAttached();
      const ariaHiddenDialogs = await products.createDialogsIncludingHidden.evaluateAll(
        (els: readonly RectEl[]) =>
          els.filter((el) => el.getAttribute("aria-hidden") === "true").length,
      );
      await attachKnownBugEvidence(page, testInfo, {
        issue: MED_X06_DIALOG_HIDDEN_ISSUE,
        observed: {
          ariaHiddenDialogs,
          visibleDialogs: await products.exposedCreateDialog.count(),
        },
        expected: { visibleDialogs: 1 },
      });
      test.fail(true, MED_X06_DIALOG_HIDDEN_ISSUE);
      await expect(products.exposedCreateDialog).toHaveCount(1);
    },
  );

  test(
    "P1-MED-FW-X07 Order header menu has a name and works by keyboard",
    {
      tag: ["@medusa", "@a11y"],
      annotation: [
        { type: "testId", description: "P1-MED-FW-X07" },
        { type: "priority", description: "P2" },
      ],
    },
    async ({ page, medusaQa }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      const order = await medusaQa.createOrder("menu", 2);
      const detail = new MedusaOrderDetailPage(page);
      await detail.goto(order.id);
      await expect(detail.heading(order.displayId)).toBeVisible();

      // Start from the top of the page: a click on empty space makes the Tab order begin there (probe Q-38: 6 presses).
      await page.mouse.click(700, 5);
      let presses = 0;
      let reached = false;
      while (!reached && presses < 10) {
        await page.keyboard.press("Tab");
        presses += 1;
        reached = await containsActiveElement(detail.actionsMenuButton);
      }
      expect(reached, "Tab reaches the header menu trigger within 10 presses").toBe(true);
      await page.keyboard.press("Enter");
      await expect(detail.cancelMenuItem).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(detail.cancelMenuItem).toHaveCount(0);
      expect(await containsActiveElement(detail.actionsMenuButton), "focus returns").toBe(true);

      await attachKnownBugEvidence(page, testInfo, {
        issue: MED_X07_MENU_TRIGGER_NAME_ISSUE,
        observed: {
          presses,
          ariaLabel: await detail.actionsMenuButton.getAttribute("aria-label"),
          ariaLabelledby: await detail.actionsMenuButton.getAttribute("aria-labelledby"),
          text: (await detail.actionsMenuButton.innerText()).trim(),
        },
        expected: { accessibleName: "non-empty" },
      });
      test.fail(true, MED_X07_MENU_TRIGGER_NAME_ISSUE);
      await expect(detail.actionsMenuButton).toHaveAccessibleName(/\S/);
    },
  );

  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test(
      "P1-MED-FW-X08 Login error is announced",
      {
        tag: ["@medusa", "@a11y"],
        annotation: [
          { type: "testId", description: "P1-MED-FW-X08" },
          { type: "priority", description: "P2" },
        ],
      },
      async ({ page }, testInfo) => {
        onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
        const login = new MedusaLoginPage(page);
        await login.goto();
        await expect(login.heading).toBeVisible();
        // Non-real credentials: the evidence never holds a real secret.
        await login.signIn("p1-qa-nobody@qa.local", "p1-qa-not-a-password");
        await expect(login.error).toBeVisible();
        expect(new URL(page.url()).pathname).toBe("/app/login");
        const element = await login.error.evaluate((el: RectEl) => ({
          tag: el.tagName,
          role: el.getAttribute("role"),
          ariaLive: el.getAttribute("aria-live"),
          id: el.id === "" ? null : el.id,
        }));
        await attachKnownBugEvidence(page, testInfo, {
          issue: MED_X08_LOGIN_ERROR_ISSUE,
          observed: element,
          expected: { role: "alert" },
        });
        test.fail(true, MED_X08_LOGIN_ERROR_ISSUE);
        await expect(login.errorAlert).toHaveCount(1);
      },
    );
  });

  test(
    "P1-MED-FW-X13 Order detail reflows at 393 px",
    {
      tag: ["@medusa", "@a11y", "@visual"],
      annotation: [
        { type: "testId", description: "P1-MED-FW-X13" },
        { type: "priority", description: "P3" },
      ],
    },
    async ({ page, medusaQa }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-mobile"]);
      const order = await medusaQa.createOrder("reflow", 2);
      const detail = new MedusaOrderDetailPage(page);
      await detail.goto(order.id);
      await expect(detail.heading(order.displayId)).toBeVisible();
      const doc = await documentScroll(page);
      expect(doc.scrollWidth, "the document itself does not scroll sideways").toBeLessThanOrEqual(
        doc.clientWidth + 1,
      );

      const main = await detail.main.evaluate(
        (el: { scrollWidth: number; clientWidth: number }) => ({
          mainSW: el.scrollWidth,
          mainCW: el.clientWidth,
        }),
      );
      const triggerRights = await detail.sectionMenuTriggers.evaluateAll((els: readonly RectEl[]) =>
        els.map((el) => Math.round(el.getBoundingClientRect().right)),
      );
      await attachKnownBugEvidence(page, testInfo, {
        issue: MED_X13_REFLOW_ISSUE,
        observed: { ...main, triggerRights },
        expected: { mainSWMax: main.mainCW + 1, triggerRightMax: 394 },
      });
      test.fail(true, MED_X13_REFLOW_ISSUE);
      expect(main.mainSW, "main needs no horizontal scrolling").toBeLessThanOrEqual(
        main.mainCW + 1,
      );
      expect(
        Math.max(...triggerRights),
        "every section trigger is inside the viewport",
      ).toBeLessThanOrEqual(394);
    },
  );
});
