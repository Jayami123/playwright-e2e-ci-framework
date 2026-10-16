import {
  expectedOrderTotals,
  formatEur,
  orderArithmeticTotal,
} from "../../../src/products/medusa/money.js";
import { MedusaOrderDetailPage } from "../../../src/products/medusa/pages/order-detail.page.js";
import { expect, test } from "../../../src/products/medusa/fixtures.js";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ORDER_FIELDS =
  "status,payment_status,canceled_at,item_subtotal,shipping_subtotal,tax_total,discount_total,total,*items,*shipping_methods";

test(
  "P1-MED-FW-003 Order detail shows correct totals for an API-created order",
  {
    tag: ["@medusa", "@orders", "@money"],
    annotation: [
      { type: "testId", description: "P1-MED-FW-003" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ page, medusaQa }) => {
    const order = await medusaQa.createOrder("totals", 2);
    const detail = new MedusaOrderDetailPage(page);
    const expected = expectedOrderTotals({
      unitPrice: order.unitPrice,
      quantity: 2,
      shipping: order.shippingAmount,
      tax: 0,
    });
    let api = await medusaQa.api.getOrder(order.id, ORDER_FIELDS);

    await test.step("API totals match the expected totals", async () => {
      api = await medusaQa.api.getOrder(order.id, ORDER_FIELDS);
      expect(api.item_subtotal).toBe(expected.itemSubtotal);
      expect(api.shipping_subtotal).toBe(expected.shippingSubtotal);
      expect(api.tax_total).toBe(expected.taxTotal);
      expect(api.total).toBe(expected.total);
      expect(orderArithmeticTotal(api)).toBe(api.total);
    });
    await test.step("open order detail", async () => {
      await detail.goto(order.id);
      await expect(detail.heading(order.displayId)).toBeVisible();
      await expect(detail.summaryHeading).toBeVisible();
    });
    await test.step("UI totals equal API totals", async () => {
      const rows: readonly (readonly [string, number])[] = [
        ["Item Subtotal", api.item_subtotal],
        ["Shipping Subtotal", api.shipping_subtotal],
        ["Tax Total", api.tax_total],
        ["Order Total", api.total],
      ];
      for (const [label, value] of rows) {
        await expect(detail.totalRow(label)).toHaveText(
          new RegExp(`^${escapeRegExp(label)}\\s*${escapeRegExp(formatEur(value))}$`),
        );
      }
    });
  },
);

test(
  "P1-MED-FW-004 Cancel order from the UI",
  {
    tag: ["@medusa", "@orders", "@state"],
    annotation: [
      { type: "testId", description: "P1-MED-FW-004" },
      { type: "priority", description: "P1" },
    ],
  },
  async ({ page, medusaQa }) => {
    const order = await medusaQa.createOrder("cancel", 2);
    const detail = new MedusaOrderDetailPage(page);

    await test.step("open order", async () => {
      await detail.goto(order.id);
      await expect(detail.heading(order.displayId)).toBeVisible();
      await expect(detail.statusText("Canceled")).toHaveCount(0);
      await expect(detail.statusText("Authorized")).toHaveCount(2);
    });
    await test.step("cancel from the menu", async () => {
      await detail.openCancel();
      await expect(detail.confirmDialog).toContainText(`#${String(order.displayId)}`);
      await detail.confirmCancel();
    });
    await test.step("UI shows Canceled", async () => {
      await expect(detail.toast("Order canceled successfully")).toBeVisible();
      await expect(detail.statusText("Canceled")).toHaveCount(4);
      await expect(detail.statusText("Authorized")).toHaveCount(0);
    });
    await test.step("status survives reload", async () => {
      await page.reload();
      await expect(detail.heading(order.displayId)).toBeVisible();
      await expect(detail.statusText("Canceled")).toHaveCount(4);
      await expect(detail.statusText("Authorized")).toHaveCount(0);
    });
    await test.step("API status is canceled", async () => {
      const api = await medusaQa.api.getOrder(order.id, "status,payment_status,canceled_at");
      expect(api.status).toBe("canceled");
      expect(api.payment_status).toBe("canceled");
      expect(api.canceled_at).toBeTruthy();
    });
  },
);
