import type { APIResponse } from "@playwright/test";
import { medusaSeedCustomer } from "../../../src/products/medusa/env.js";
import { medusaQaOptionTitle, medusaQaTitle } from "../../../src/products/medusa/names.js";
import { expect, test } from "../../../src/products/medusa/fixtures.js";

const STACK_TRACE = /\bat .+\.js:\d+/;

interface ErrorBody {
  readonly type?: string;
  readonly message?: string;
  readonly stack?: unknown;
}

async function expectError(
  response: APIResponse,
  status: number,
  type?: string,
): Promise<ErrorBody> {
  const text = await response.text();
  expect(response.status(), `${response.url()} status`).toBe(status);
  expect(text, "body has no stack trace").not.toMatch(STACK_TRACE);
  const body = JSON.parse(text) as ErrorBody;
  expect(body.message, "body has a message").toBeTruthy();
  expect(body.stack, "body has no stack field").toBeUndefined();
  if (type !== undefined) {
    expect(body.type).toBe(type);
  }
  return body;
}

test.describe("Medusa API contract", () => {
  test(
    "P1-MED-FW-X01 Admin and store credentials do not cross over",
    {
      tag: ["@medusa", "@api"],
      annotation: [
        { type: "testId", description: "P1-MED-FW-X01" },
        { type: "priority", description: "P2" },
      ],
    },
    async ({ medusaAdmin }) => {
      const publishableKey = await medusaAdmin.getPublishableKey();

      await test.step("publishable key on admin", async () => {
        const response = await medusaAdmin.raw("GET", "/admin/orders", {
          headers: { "x-publishable-api-key": publishableKey },
        });
        await expectError(response, 401);
      });
      await test.step("publishable key as Bearer on admin", async () => {
        const response = await medusaAdmin.raw("GET", "/admin/orders", {
          headers: { authorization: `Bearer ${publishableKey}` },
        });
        await expectError(response, 401);
      });
      await test.step("admin token on store without key", async () => {
        const response = await medusaAdmin.raw("GET", "/store/products");
        await expectError(response, 400, "not_allowed");
      });
      await test.step("customer token on admin", async () => {
        const customer = medusaSeedCustomer();
        const login = await medusaAdmin.raw("POST", "/auth/customer/emailpass", {
          headers: { "content-type": "application/json" },
          data: { email: customer.email, password: customer.password },
        });
        expect(login.status(), "POST /auth/customer/emailpass").toBe(200);
        const { token } = (await login.json()) as { token: string };
        const response = await medusaAdmin.raw("GET", "/admin/orders", {
          headers: { authorization: `Bearer ${token}` },
        });
        await expectError(response, 401);
      });
    },
  );

  test(
    "P1-MED-FW-X02 Errors use the documented codes without stack traces",
    {
      tag: ["@medusa", "@api"],
      annotation: [
        { type: "testId", description: "P1-MED-FW-X02" },
        { type: "priority", description: "P2" },
      ],
    },
    async ({ medusaAdmin }) => {
      const auth = { authorization: `Bearer ${medusaAdmin.token}` };

      await test.step("wrong field type", async () => {
        const response = await medusaAdmin.raw("POST", "/admin/products", {
          headers: auth,
          data: { title: 123 },
        });
        const body = await expectError(response, 400, "invalid_data");
        expect(body.message).toContain("title");
      });
      await test.step("invalid JSON", async () => {
        const response = await medusaAdmin.raw("POST", "/admin/products", {
          headers: { ...auth, "content-type": "application/json" },
          data: "{not json",
        });
        await expectError(response, 400, "invalid_data");
      });
      await test.step("unknown product", async () => {
        const response = await medusaAdmin.raw("GET", "/admin/products/prod_P1QADOESNOTEXIST");
        await expectError(response, 404, "not_found");
      });
      await test.step("cancel unknown order", async () => {
        const response = await medusaAdmin.raw(
          "POST",
          "/admin/orders/order_P1QADOESNOTEXIST/cancel",
        );
        await expectError(response, 404, "not_found");
      });
      await test.step("garbage bearer token", async () => {
        const response = await medusaAdmin.raw("GET", "/admin/orders", {
          headers: { authorization: "Bearer garbage.token.value" },
        });
        await expectError(response, 401);
      });
      await test.step("expired token with a broken signature", async () => {
        const encode = (value: object): string =>
          Buffer.from(JSON.stringify(value)).toString("base64url");
        const tampered = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ exp: 1 })}.bad-signature`;
        const response = await medusaAdmin.raw("GET", "/admin/orders", {
          headers: { authorization: `Bearer ${tampered}` },
        });
        await expectError(response, 401);
      });
    },
  );

  test(
    "P1-MED-FW-X03 Product creation boundaries",
    {
      tag: ["@medusa", "@api"],
      annotation: [
        { type: "testId", description: "P1-MED-FW-X03" },
        { type: "priority", description: "P2" },
      ],
    },
    async ({ medusaQa }) => {
      const api = medusaQa.api;
      const shippingProfileId = await api.getDefaultShippingProfileId();
      const optionTitle = medusaQaOptionTitle(medusaQa.prefix, "Size");

      function body(title: string, amount: number): Record<string, unknown> {
        return {
          title,
          status: "draft",
          shipping_profile_id: shippingProfileId,
          options: [{ title: optionTitle, values: ["One"] }],
          variants: [
            {
              title: "One",
              options: { [optionTitle]: "One" },
              manage_inventory: false,
              prices: [{ currency_code: "eur", amount }],
            },
          ],
        };
      }

      async function created(response: APIResponse): Promise<{ id: string }> {
        expect(response.status(), "POST /admin/products").toBe(200);
        const json = (await response.json()) as { product: { id: string } };
        medusaQa.captureProductId(json.product.id);
        return json.product;
      }

      await test.step("no options is rejected", async () => {
        const response = await api.createProductRaw({
          title: medusaQaTitle(medusaQa.prefix, "no-options"),
          status: "draft",
          shipping_profile_id: shippingProfileId,
        });
        await expectError(response, 400, "invalid_data");
      });
      await test.step("one option with one value gives one variant", async () => {
        const title = medusaQaTitle(medusaQa.prefix, "one-by-one");
        await created(await api.createProductRaw(body(title, 25)));
        const found = await api.findProductsByTitle(title);
        expect(found.products[0]?.variants).toHaveLength(1);
      });
      await test.step("price 0 is stored as 0", async () => {
        const title = medusaQaTitle(medusaQa.prefix, "free");
        const product = await created(await api.createProductRaw(body(title, 0)));
        const response = await api.raw(
          "GET",
          `/admin/products/${product.id}?fields=*variants.prices`,
        );
        const json = (await response.json()) as {
          product: { variants: { prices: { amount: number }[] }[] };
        };
        expect(json.product.variants[0]?.prices.map((price) => price.amount)).toEqual([0]);
      });
      await test.step("5000 character title is stored in full", async () => {
        const prefix = `${medusaQaTitle(medusaQa.prefix, "long")}-`;
        const title = prefix + "x".repeat(5000 - prefix.length);
        expect(title).toHaveLength(5000);
        const product = await created(await api.createProductRaw(body(title, 25)));
        const response = await api.raw("GET", `/admin/products/${product.id}?fields=id,title`);
        const json = (await response.json()) as { product: { title: string } };
        expect(json.product.title).toHaveLength(title.length);
      });
    },
  );
});
