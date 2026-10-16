import { expect, test } from "@playwright/test";
import {
  expectedOrderTotals,
  formatEur,
  orderArithmeticTotal,
} from "../../src/products/medusa/money.js";

test.describe("Medusa money helpers", { tag: ["@unit"] }, () => {
  test("formats probe amounts", () => {
    expect([50, 10, 0, 60].map(formatEur)).toEqual(["€50.00", "€10.00", "€0.00", "€60.00"]);
  });

  test("computes expected totals 25×2+10+0=60", () => {
    expect(expectedOrderTotals({ unitPrice: 25, quantity: 2, shipping: 10, tax: 0 })).toEqual({
      itemSubtotal: 50,
      shippingSubtotal: 10,
      taxTotal: 0,
      total: 60,
    });
  });

  test("arithmetic matches the probe order shape", () => {
    expect(
      orderArithmeticTotal({
        items: [{ unit_price: 25, quantity: 2 }],
        shipping_methods: [{ amount: 10 }],
        tax_total: 0,
        discount_total: 0,
      }),
    ).toBe(60);
  });
});
