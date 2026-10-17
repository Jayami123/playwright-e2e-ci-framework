import type { MedusaQaOrder } from "../../../src/products/medusa/fixtures.js";
import { MedusaOrdersPage } from "../../../src/products/medusa/pages/orders.page.js";
import { medusaQaVisualEmail } from "../../../src/products/medusa/names.js";
import { stubFlagImages } from "../../../src/products/medusa/network.js";
import { expect, test } from "../../../src/products/medusa/visual-fixtures.js";
import { freezeClock, VISUAL_FROZEN_INSTANT } from "../../../src/support/visual/clock.js";
import { maskLocators } from "../../../src/support/visual/masks.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";
import { stableScreenshot } from "../../../src/support/visual/screenshot.js";

test(
  "P1-MED-VIS-001 Orders list baseline at three viewports",
  {
    tag: ["@medusa", "@visual"],
    annotation: [
      { type: "testId", description: "P1-MED-VIS-001" },
      { type: "priority", description: "P2" },
    ],
  },
  async ({ page, medusaQa }, testInfo) => {
    onlyOnProjects(testInfo.project.name, ["visual-mobile", "visual-tablet", "visual-desktop"]);
    const worker = testInfo.parallelIndex;
    // Identical emails and titles every run keep the column widths stable (plan D2). The per-test token
    // only appears in the shipping last name, which `q` searches and the list does not show.
    const token = `${medusaQa.prefix}-${testInfo.project.name}`;
    const orders: MedusaQaOrder[] = [];
    for (const leaf of ["o1", "o2", "o3"]) {
      orders.push(
        await medusaQa.createOrder(leaf, 2, {
          email: medusaQaVisualEmail(worker, leaf),
          lastName: token,
          productTitle: `P1-QA-VIS-${String(worker)}-${leaf}`,
        }),
      );
    }
    const list = new MedusaOrdersPage(page);

    await test.step("open the filtered orders list", async () => {
      await freezeClock(page, VISUAL_FROZEN_INSTANT);
      await stubFlagImages(page);
      await list.gotoSearch(token);
      await expect(list.heading).toBeVisible();
      for (const order of orders) {
        await expect(list.orderLink(order.displayId)).toBeVisible();
      }
      await expect(list.orderLinks).toHaveCount(3);
      await expect(list.resultsSummary(3)).toBeVisible();
    });

    await test.step("baseline", async () => {
      const mask = maskLocators(page, "medusa-orders-list");
      // Display id, created_at and the search value, per the whole-cell masks of plan D3.
      expect(await Promise.all(mask.map((locator) => locator.count()))).toEqual([3, 3, 1]);
      await stableScreenshot(page, "med-orders-list", { mask });
    });
  },
);
