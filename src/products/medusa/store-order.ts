import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";

export interface StoreOrderInput {
  readonly publishableKey: string;
  readonly regionId: string;
  readonly salesChannelId: string;
  readonly variantId: string;
  readonly quantity: number;
  readonly email: string;
}

export interface StoreOrderResult {
  readonly id: string;
  readonly displayId: number;
  readonly email: string;
  readonly shippingAmount: number;
}

const ADDRESS = {
  first_name: "P1",
  last_name: "QA",
  address_1: "Teststr 1",
  city: "Berlin",
  country_code: "de",
  postal_code: "10115",
} as const;

async function ok<T>(response: APIResponse, label: string): Promise<T> {
  expect(response.status(), label).toBe(200);
  return (await response.json()) as T;
}

/** The eight store calls of probe P-32. Each step asserts 200. */
export async function createStoreOrder(
  request: APIRequestContext,
  input: StoreOrderInput,
): Promise<StoreOrderResult> {
  const headers = { "x-publishable-api-key": input.publishableKey };

  const created = await ok<{ cart: { id: string } }>(
    await request.post("/store/carts", {
      headers,
      data: {
        region_id: input.regionId,
        email: input.email,
        sales_channel_id: input.salesChannelId,
      },
    }),
    "POST /store/carts",
  );
  const cartId = created.cart.id;

  await ok(
    await request.post(`/store/carts/${cartId}/line-items`, {
      headers,
      data: { variant_id: input.variantId, quantity: input.quantity },
    }),
    "POST /store/carts/{id}/line-items",
  );

  await ok(
    await request.post(`/store/carts/${cartId}`, {
      headers,
      data: { shipping_address: ADDRESS, billing_address: ADDRESS },
    }),
    "POST /store/carts/{id}",
  );

  const options = await ok<{
    shipping_options: { id: string; name: string; amount: number }[];
  }>(
    await request.get(`/store/shipping-options?cart_id=${cartId}`, { headers }),
    "GET /store/shipping-options",
  );
  const standard = options.shipping_options.find((o) => o.name === "Standard Shipping");
  expect(standard, "Standard Shipping option").toBeDefined();

  await ok(
    await request.post(`/store/carts/${cartId}/shipping-methods`, {
      headers,
      data: { option_id: standard?.id },
    }),
    "POST /store/carts/{id}/shipping-methods",
  );

  const collection = await ok<{ payment_collection: { id: string } }>(
    await request.post("/store/payment-collections", { headers, data: { cart_id: cartId } }),
    "POST /store/payment-collections",
  );

  await ok(
    await request.post(
      `/store/payment-collections/${collection.payment_collection.id}/payment-sessions`,
      { headers, data: { provider_id: "pp_system_default" } },
    ),
    "POST /store/payment-collections/{id}/payment-sessions",
  );

  const completed = await ok<{
    type: string;
    order: { id: string; display_id: number; email: string };
  }>(
    await request.post(`/store/carts/${cartId}/complete`, { headers }),
    "POST /store/carts/{id}/complete",
  );
  expect(completed.type, "cart completion result").toBe("order");

  return {
    id: completed.order.id,
    displayId: completed.order.display_id,
    email: completed.order.email,
    shippingAmount: standard?.amount ?? 0,
  };
}
