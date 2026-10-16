import { MedusaOrderDetailPage } from "../../../src/products/medusa/pages/order-detail.page.js";
import { medusaQaVisualEmail } from "../../../src/products/medusa/names.js";
import { expect, test } from "../../../src/products/medusa/visual-fixtures.js";
import { MED_DE } from "../../../src/products/medusa/visual.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { boundingBoxOf, documentScroll, measureScroll } from "../../../src/support/visual/dom.js";
import { overflowingControls, rectInsideWidth } from "../../../src/support/visual/layout.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";

test.describe("Medusa German admin", () => {
  test.use({ adminLanguage: "de" });

  test(
    "P1-MED-I18N-001 German Admin order page layout",
    {
      tag: ["@medusa", "@i18n", "@visual"],
      annotation: [
        { type: "testId", description: "P1-MED-I18N-001" },
        { type: "priority", description: "P2" },
      ],
    },
    async ({ page, medusaQa }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop", "visual-tablet"]);
      const worker = testInfo.parallelIndex;
      const order = await medusaQa.createOrder("de", 2, {
        email: medusaQaVisualEmail(worker, "de"),
        productTitle: `P1-QA-VIS-${String(worker)}-Bestellung`,
      });
      const detail = new MedusaOrderDetailPage(page);

      await test.step("open the order in German", async () => {
        await freezeClock(page, VISUAL_FROZEN_INSTANT);
        await detail.goto(order.id);
        await expect(detail.heading(order.displayId)).toBeVisible();
        expect(await page.evaluate<string>("document.documentElement.lang")).toBe("de");
        for (const heading of MED_DE.headings) {
          await expect(detail.sectionHeading(heading)).toBeVisible();
        }
      });

      await test.step("no horizontal overflow", async () => {
        const scroll = await documentScroll(page);
        expect(scroll.scrollWidth).toBeLessThanOrEqual(scroll.clientWidth + 1);
        const main = await detail.main.evaluate(
          (el: { scrollWidth: number; clientWidth: number }) => ({
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
          }),
        );
        expect(main.scrollWidth).toBeLessThanOrEqual(main.clientWidth + 1);
      });

      await test.step("API precondition for the badge counts", async () => {
        // The counts of 2 are fixed by the data design (plan D2): one authorized payment, nothing
        // fulfilled. The badge shows once in the header and once in the Payments section.
        const api = await medusaQa.api.getOrder(
          order.id,
          "payment_status,fulfillment_status,*payment_collections,*payment_collections.payments",
        );
        expect(api.payment_status).toBe("authorized");
        expect(api.fulfillment_status).toBe("not_fulfilled");
        expect(api.payment_collections).toHaveLength(1);
        expect(api.payment_collections?.[0]?.payments).toHaveLength(1);
      });

      await test.step("status badges are fully visible", async () => {
        const authorized = detail.statusText(MED_DE.authorized);
        const pending = detail.statusText(MED_DE.pending);
        await expect(authorized).toHaveCount(2);
        await expect(pending).toHaveCount(2);
        for (const badges of [authorized, pending]) {
          expect(overflowingControls(await measureScroll(badges))).toEqual([]);
          const viewport = page.viewportSize();
          if (viewport === null) throw new Error("no viewport");
          for (const badge of await badges.all()) {
            const box = await boundingBoxOf("status badge", badge);
            expect(rectInsideWidth(box, viewport.width), "status badge inside the viewport").toBe(
              true,
            );
          }
        }
      });

      await test.step("action menu is fully visible", async () => {
        const viewport = page.viewportSize();
        if (viewport === null) throw new Error("no viewport");
        const box = await boundingBoxOf("header menu trigger", detail.actionsMenuButton);
        expect(rectInsideWidth(box, viewport.width)).toBe(true);
        await detail.actionsMenuButton.click();
        await expect(detail.menuItem(MED_DE.cancel)).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(detail.menuItem(MED_DE.cancel)).toHaveCount(0);
      });

      await test.step("baseline", async () => {
        const mask = maskLocators(page, "medusa-order-detail");
        for (const locator of mask) {
          await expect(locator).not.toHaveCount(0);
        }
        const viewport = page.viewportSize();
        if (viewport === null) throw new Error("no viewport");
        const payments = await boundingBoxOf(
          "Zahlungen heading",
          detail.sectionHeading("Zahlungen"),
        );
        const customer = await boundingBoxOf("Kunde heading", detail.sectionHeading("Kunde"));
        // Top of the page to 8 px above "Zahlungen"; the desktop clip stops left of the Kunde column,
        // whose address lines vary (probe Q-12). Tablet stacks the columns, so it keeps the full width.
        const width = testInfo.project.name === "visual-desktop" ? customer.x - 24 : viewport.width;
        await stableScreenshot(page, "med-order-de", {
          mask,
          clip: { x: 0, y: 0, width: Math.floor(width), height: Math.floor(payments.y - 8) },
        });
      });
    },
  );
});
