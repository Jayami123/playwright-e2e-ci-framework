import { request as playwrightRequest } from "@playwright/test";
import { createPgClient } from "qa-portfolio-harness";
import {
  createMedusaAdminApi,
  loginAdminToken,
  type MedusaAdminApi,
  type MedusaOrder,
} from "./admin-api.js";
import { loadMedusaConfig, MEDUSA_TIMEOUTS } from "./env.js";

const PAGE_SIZE = 100;
const MAX_PAGES = 100;

/** Cancels open fulfillments, cancels the order, then archives it (orders have no delete route). */
export async function destroyOrderById(api: MedusaAdminApi, orderId: string): Promise<void> {
  let order: MedusaOrder = await api.getOrder(orderId, "status,*fulfillments");
  if (order.status === "archived") {
    return;
  }
  for (const fulfillment of order.fulfillments ?? []) {
    if (fulfillment.canceled_at === null) {
      await api.cancelFulfillment(orderId, fulfillment.id);
    }
  }
  if (order.status !== "canceled") {
    const response = await api.cancelOrder(orderId);
    if (response.status() !== 200) {
      throw new Error(`POST /admin/orders/{id}/cancel returned ${String(response.status())}`);
    }
  }
  order = await api.getOrder(orderId, "status");
  if (order.status !== "archived") {
    await api.archiveOrder(orderId);
  }
}

export async function destroyCustomersByEmail(api: MedusaAdminApi, email: string): Promise<void> {
  for (const id of await api.findCustomerIdsByEmail(email.toLowerCase())) {
    await api.deleteCustomer(id);
  }
}

async function listAll<T>(api: MedusaAdminApi, path: string, key: string): Promise<readonly T[]> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await api.raw(
      "GET",
      `${path}${separator}limit=${String(PAGE_SIZE)}&offset=${String(page * PAGE_SIZE)}`,
    );
    if (response.status() !== 200) {
      throw new Error(`GET ${path.split("?")[0] ?? path} returned ${String(response.status())}`);
    }
    const body = (await response.json()) as Record<string, unknown>;
    const rows = (body[key] ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) {
      break;
    }
  }
  return out;
}

export interface MedusaSweepResult {
  readonly before: number;
  readonly deleted: number;
  readonly after: number;
}

interface SweepRows {
  readonly products: readonly { id: string; title: string }[];
  readonly orders: readonly { id: string; status: string; email: string }[];
  readonly customers: readonly { id: string; email: string }[];
}

async function listQaRows(api: MedusaAdminApi, prefix: string): Promise<SweepRows> {
  const lower = prefix.toLowerCase();
  const [products, orders, customers] = await Promise.all([
    listAll<{ id: string; title: string }>(
      api,
      `/admin/products?q=${encodeURIComponent(prefix)}&fields=id,title`,
      "products",
    ),
    listAll<{ id: string; status: string; email: string }>(
      api,
      `/admin/orders?q=${encodeURIComponent(lower)}&fields=id,status,email`,
      "orders",
    ),
    listAll<{ id: string; email: string }>(
      api,
      `/admin/customers?q=${encodeURIComponent(lower)}&fields=id,email`,
      "customers",
    ),
  ]);
  return {
    products: products.filter((p) => p.title.startsWith(prefix)),
    orders: orders.filter(
      (o) => o.email.toLowerCase().startsWith(lower) && o.status !== "archived",
    ),
    customers: customers.filter((c) => c.email.toLowerCase().startsWith(lower)),
  };
}

function countRows(rows: SweepRows): number {
  return rows.products.length + rows.orders.length + rows.customers.length;
}

/** Deletes live QA records by listed id through the Admin API. Archived orders are not counted. */
export async function sweepMedusaQaRecords(prefix: string): Promise<MedusaSweepResult> {
  const config = loadMedusaConfig();
  const context = await playwrightRequest.newContext({
    baseURL: config.baseUrl,
    timeout: MEDUSA_TIMEOUTS.request,
  });
  try {
    const token = await loginAdminToken(context, config.adminEmail, config.adminPassword);
    const api = createMedusaAdminApi(context, token);

    const before = await listQaRows(api, prefix);
    for (const order of before.orders) {
      await destroyOrderById(api, order.id);
    }
    for (const product of before.products) {
      await api.deleteProduct(product.id);
    }
    for (const customer of before.customers) {
      await api.deleteCustomer(customer.id);
    }
    const after = await listQaRows(api, prefix);
    const result = {
      before: countRows(before),
      deleted: countRows(before) - countRows(after),
      after: countRows(after),
    };
    console.log(
      `Medusa qa sweep: before=${String(result.before)} deleted=${String(result.deleted)} after=${String(result.after)}`,
    );
    return result;
  } finally {
    await context.dispose();
  }
}

export interface MedusaLeakCounts {
  readonly products: number;
  readonly options: number;
  readonly customers: number;
  readonly liveOrders: number;
  readonly openFulfillments: number;
  /** Informational: orders have no delete route (probe P-39). */
  readonly archivedOrders: number;
  readonly carts: number;
}

/** Read-only SQL counts. */
export async function countMedusaQaLeaks(): Promise<MedusaLeakCounts> {
  const pool = createPgClient(loadMedusaConfig().dbUrl);
  async function count(sql: string): Promise<number> {
    const result = await pool.query<{ count: number }>(sql);
    return result.rows[0]?.count ?? 0;
  }
  try {
    return {
      products: await count(
        "SELECT count(*)::int AS count FROM product WHERE title ILIKE 'P1-QA-%' AND deleted_at IS NULL",
      ),
      options: await count(
        "SELECT count(*)::int AS count FROM product_option WHERE title ILIKE 'P1-QA-%' AND deleted_at IS NULL",
      ),
      customers: await count(
        "SELECT count(*)::int AS count FROM customer WHERE email ILIKE 'p1-qa-%' AND deleted_at IS NULL",
      ),
      liveOrders: await count(
        `SELECT count(*)::int AS count FROM "order" WHERE email ILIKE 'p1-qa-%' AND status <> 'archived'`,
      ),
      openFulfillments: await count(
        `SELECT count(*)::int AS count FROM fulfillment f JOIN order_fulfillment ofu ON ofu.fulfillment_id = f.id JOIN "order" o ON o.id = ofu.order_id WHERE o.email ILIKE 'p1-qa-%' AND f.canceled_at IS NULL`,
      ),
      archivedOrders: await count(
        `SELECT count(*)::int AS count FROM "order" WHERE email ILIKE 'p1-qa-%' AND status = 'archived'`,
      ),
      carts: await count("SELECT count(*)::int AS count FROM cart WHERE email ILIKE 'p1-qa-%'"),
    };
  } finally {
    await pool.end();
  }
}
