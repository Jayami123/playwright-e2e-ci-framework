import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { MEDUSA_ROUTES } from "./env.js";

export interface MedusaOrderItem {
  readonly id: string;
  readonly unit_price: number;
  readonly quantity: number;
}

export interface MedusaFulfillment {
  readonly id: string;
  readonly canceled_at: string | null;
}

export interface MedusaOrder {
  readonly id: string;
  readonly display_id: number;
  readonly email: string;
  readonly status: string;
  readonly payment_status: string;
  readonly fulfillment_status: string;
  readonly canceled_at: string | null;
  readonly item_subtotal: number;
  readonly shipping_subtotal: number;
  readonly tax_total: number;
  readonly discount_total: number;
  readonly total: number;
  readonly items: readonly MedusaOrderItem[];
  readonly shipping_methods: readonly { readonly amount: number }[];
  readonly fulfillments?: readonly MedusaFulfillment[];
  readonly payment_collections?: readonly {
    readonly payments?: readonly {
      readonly canceled_at: string | null;
      readonly refunds?: readonly unknown[];
    }[];
  }[];
}

export interface MedusaProductSummary {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly variants: readonly {
    readonly id: string;
    readonly options: readonly { readonly value: string; readonly option?: { title: string } }[];
  }[];
  readonly options: readonly {
    readonly title: string;
    readonly values: readonly { readonly value: string }[];
  }[];
}

export interface MedusaAdminApi {
  readonly token: string;
  getMe(): Promise<{ email: string }>;
  getPublishableKey(): Promise<string>;
  getEuropeRegionId(): Promise<string>;
  getDefaultSalesChannelId(): Promise<string>;
  getDefaultShippingProfileId(): Promise<string>;
  getEuropeanWarehouseId(): Promise<string>;
  createProduct(input: {
    title: string;
    optionTitle: string;
    amountEur: number;
  }): Promise<{ id: string; variantId: string }>;
  createProductRaw(body: unknown): Promise<APIResponse>;
  findProductsByTitle(
    title: string,
  ): Promise<{ count: number; products: readonly MedusaProductSummary[] }>;
  deleteProduct(id: string): Promise<void>;
  getOrder(id: string, fields: string): Promise<MedusaOrder>;
  cancelOrder(id: string): Promise<APIResponse>;
  createFulfillment(
    id: string,
    items: readonly { id: string; quantity: number }[],
    locationId: string,
  ): Promise<APIResponse>;
  /** Uses the fulfillment route: the order route rejects canceled orders (the F-01 state). */
  cancelFulfillment(fulfillmentId: string): Promise<void>;
  archiveOrder(id: string): Promise<void>;
  listOrderChanges(id: string): Promise<readonly { change_type: string; status: string }[]>;
  findCustomerIdsByEmail(email: string): Promise<readonly string[]>;
  deleteCustomer(id: string): Promise<void>;
  raw(
    method: "GET" | "POST" | "DELETE",
    path: string,
    init?: { headers?: Record<string, string>; data?: unknown },
  ): Promise<APIResponse>;
}

async function expectJson<T>(response: APIResponse, label: string, status = 200): Promise<T> {
  expect(response.status(), label).toBe(status);
  return (await response.json()) as T;
}

/** POST /auth/user/emailpass. Never logs the body or the token. */
export async function loginAdminToken(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const response = await request.post(MEDUSA_ROUTES.authEmailpass, { data: { email, password } });
  const body = await expectJson<{ token?: string }>(response, "POST /auth/user/emailpass");
  expect(typeof body.token === "string" && body.token.length > 0, "login returned a token").toBe(
    true,
  );
  return body.token ?? "";
}

/** POST /auth/session turns the Bearer token into a `connect.sid` cookie. */
export async function createAdminSession(request: APIRequestContext, token: string): Promise<void> {
  const response = await request.post(MEDUSA_ROUTES.authSession, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.status(), "POST /auth/session").toBe(200);
}

export function createMedusaAdminApi(request: APIRequestContext, token: string): MedusaAdminApi {
  const headers = { authorization: `Bearer ${token}` };

  async function get<T>(path: string): Promise<T> {
    return expectJson<T>(await request.get(path, { headers }), `GET ${path.split("?")[0] ?? path}`);
  }

  async function post(path: string, data?: unknown): Promise<APIResponse> {
    return request.post(path, { headers, data });
  }

  return {
    token,
    async getMe() {
      const body = await get<{ user: { email: string } }>(MEDUSA_ROUTES.usersMe);
      return { email: body.user.email };
    },
    async getPublishableKey() {
      const body = await get<{
        api_keys: {
          token: string;
          type: string;
          revoked_at: string | null;
          sales_channels?: { name: string }[];
        }[];
      }>("/admin/api-keys?fields=*sales_channels&limit=50");
      const key = body.api_keys.find(
        (k) =>
          k.type === "publishable" &&
          k.revoked_at === null &&
          (k.sales_channels ?? []).some((c) => c.name === "Default Sales Channel"),
      );
      expect(key, "publishable key linked to Default Sales Channel").toBeDefined();
      return key?.token ?? "";
    },
    async getEuropeRegionId() {
      const body = await get<{ regions: { id: string; currency_code: string }[] }>(
        "/admin/regions",
      );
      const region = body.regions.find((r) => r.currency_code === "eur");
      expect(region, "EUR region").toBeDefined();
      return region?.id ?? "";
    },
    async getDefaultSalesChannelId() {
      const body = await get<{ sales_channels: { id: string; name: string }[] }>(
        "/admin/sales-channels",
      );
      const channel = body.sales_channels.find((c) => c.name === "Default Sales Channel");
      expect(channel, "Default Sales Channel").toBeDefined();
      return channel?.id ?? "";
    },
    async getDefaultShippingProfileId() {
      const body = await get<{ shipping_profiles: { id: string; type: string }[] }>(
        "/admin/shipping-profiles",
      );
      const profile = body.shipping_profiles.find((p) => p.type === "default");
      expect(profile, "default shipping profile").toBeDefined();
      return profile?.id ?? "";
    },
    async getEuropeanWarehouseId() {
      const body = await get<{ stock_locations: { id: string; name: string }[] }>(
        "/admin/stock-locations",
      );
      const location = body.stock_locations.find((l) => l.name === "European Warehouse");
      expect(location, "European Warehouse").toBeDefined();
      return location?.id ?? "";
    },
    async createProduct({ title, optionTitle, amountEur }) {
      const [salesChannelId, shippingProfileId] = await Promise.all([
        this.getDefaultSalesChannelId(),
        this.getDefaultShippingProfileId(),
      ]);
      const response = await post("/admin/products", {
        title,
        status: "published",
        shipping_profile_id: shippingProfileId,
        sales_channels: [{ id: salesChannelId }],
        options: [{ title: optionTitle, values: ["One"] }],
        variants: [
          {
            title: "One",
            options: { [optionTitle]: "One" },
            manage_inventory: false,
            prices: [{ currency_code: "eur", amount: amountEur }],
          },
        ],
      });
      const body = await expectJson<{ product: { id: string; variants: { id: string }[] } }>(
        response,
        "POST /admin/products",
      );
      return { id: body.product.id, variantId: body.product.variants[0]?.id ?? "" };
    },
    async createProductRaw(body) {
      return post("/admin/products", body);
    },
    async findProductsByTitle(title) {
      const fields = "id,title,status,*variants,*variants.options,*options,*options.values";
      return get(`/admin/products?q=${encodeURIComponent(title)}&fields=${fields}`);
    },
    async deleteProduct(id) {
      const response = await request.delete(`/admin/products/${id}`, { headers });
      const body = await expectJson<{ deleted: boolean }>(response, "DELETE /admin/products/{id}");
      expect(body.deleted, "product deleted").toBe(true);
    },
    async getOrder(id, fields) {
      const body = await get<{ order: MedusaOrder }>(
        `/admin/orders/${id}?fields=${encodeURIComponent(fields)}`,
      );
      return body.order;
    },
    async cancelOrder(id) {
      return post(`/admin/orders/${id}/cancel`);
    },
    async createFulfillment(id, items, locationId) {
      return post(`/admin/orders/${id}/fulfillments`, { items, location_id: locationId });
    },
    async cancelFulfillment(fulfillmentId) {
      const response = await post(`/admin/fulfillments/${fulfillmentId}/cancel`);
      expect(response.status(), "POST /admin/fulfillments/{id}/cancel").toBe(200);
    },
    async archiveOrder(id) {
      const body = await expectJson<{ order: { status: string } }>(
        await post(`/admin/orders/${id}/archive`),
        "POST /admin/orders/{id}/archive",
      );
      expect(body.order.status, "order archived").toBe("archived");
    },
    async listOrderChanges(id) {
      const body = await get<{ order_changes: { change_type: string; status: string }[] }>(
        `/admin/orders/${id}/changes`,
      );
      return body.order_changes;
    },
    async findCustomerIdsByEmail(email) {
      const body = await get<{ customers: { id: string; email: string }[] }>(
        `/admin/customers?q=${encodeURIComponent(email)}&limit=100`,
      );
      return body.customers.filter((c) => c.email.toLowerCase() === email).map((c) => c.id);
    },
    async deleteCustomer(id) {
      const response = await request.delete(`/admin/customers/${id}`, { headers });
      const body = await expectJson<{ deleted: boolean }>(response, "DELETE /admin/customers/{id}");
      expect(body.deleted, "customer deleted").toBe(true);
    },
    async raw(method, path, init) {
      const options = {
        headers: init?.headers ?? headers,
        data: init?.data,
        failOnStatusCode: false,
      };
      if (method === "GET") {
        return request.get(path, options);
      }
      if (method === "DELETE") {
        return request.delete(path, options);
      }
      return request.post(path, options);
    },
  };
}
