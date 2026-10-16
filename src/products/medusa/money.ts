const EUR = new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" });

export function formatEur(amount: number): string {
  return EUR.format(amount);
}

export interface ExpectedTotalsInput {
  readonly unitPrice: number;
  readonly quantity: number;
  readonly shipping: number;
  readonly tax: number;
}

export interface ExpectedTotals {
  readonly itemSubtotal: number;
  readonly shippingSubtotal: number;
  readonly taxTotal: number;
  readonly total: number;
}

export function expectedOrderTotals(input: ExpectedTotalsInput): ExpectedTotals {
  const itemSubtotal = input.unitPrice * input.quantity;
  return {
    itemSubtotal,
    shippingSubtotal: input.shipping,
    taxTotal: input.tax,
    total: itemSubtotal + input.shipping + input.tax,
  };
}

export interface OrderArithmeticShape {
  readonly items: readonly { readonly unit_price: number; readonly quantity: number }[];
  readonly shipping_methods: readonly { readonly amount: number }[];
  readonly tax_total: number;
  readonly discount_total: number;
}

/** Sum of unit_price x quantity, plus shipping amounts, plus tax, minus discount. */
export function orderArithmeticTotal(order: OrderArithmeticShape): number {
  const items = order.items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const shipping = order.shipping_methods.reduce((sum, method) => sum + method.amount, 0);
  return items + shipping + order.tax_total - order.discount_total;
}
