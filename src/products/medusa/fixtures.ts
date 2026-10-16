import { setFactorySeed } from "qa-portfolio-harness";
import { request as playwrightRequest, test as base } from "@playwright/test";
import { parsePositiveInt } from "../../core/config.js";
import { createMedusaAdminApi, loginAdminToken, type MedusaAdminApi } from "./admin-api.js";
import { loadMedusaConfig, MEDUSA_TIMEOUTS } from "./env.js";
import { medusaQaEmail, medusaQaOptionTitle, medusaQaPrefix, medusaQaTitle } from "./names.js";
import { createStoreOrder, type StoreOrderResult } from "./store-order.js";
import { destroyCustomersByEmail, destroyOrderById } from "./sweep.js";

export const MEDUSA_QA_UNIT_PRICE = 25;

export interface MedusaQaCapturedIds {
  readonly productIds: string[];
  readonly orderIds: string[];
  readonly customerEmails: string[];
}

export interface MedusaQaOrder extends StoreOrderResult {
  readonly productId: string;
  readonly unitPrice: number;
}

export interface MedusaQaFixture {
  readonly prefix: string;
  readonly api: MedusaAdminApi;
  createProduct(leaf?: string): Promise<{
    id: string;
    variantId: string;
    title: string;
    unitPrice: number;
  }>;
  createOrder(leaf?: string, quantity?: number): Promise<MedusaQaOrder>;
  captureProductId(id: string): void;
  captureOrderId(id: string): void;
}

interface MedusaQaFixtures {
  medusaAdmin: MedusaAdminApi;
  medusaQa: MedusaQaFixture;
}

interface MedusaWorkerFixtures {
  factorySeed: number;
}

/** Orders first (fulfillments, cancel, archive), then products, then guest customers. */
export async function runMedusaQaCleanup(params: {
  readonly api: MedusaAdminApi;
  readonly captured: MedusaQaCapturedIds;
  readonly testError?: unknown;
}): Promise<void> {
  const failures: unknown[] = [];
  if (params.testError !== undefined) {
    failures.push(params.testError);
  }

  for (const orderId of params.captured.orderIds) {
    try {
      await destroyOrderById(params.api, orderId);
    } catch (error) {
      failures.push(error);
    }
  }
  for (const productId of params.captured.productIds) {
    try {
      await params.api.deleteProduct(productId);
    } catch (error) {
      failures.push(error);
    }
  }
  for (const email of params.captured.customerEmails) {
    try {
      await destroyCustomersByEmail(params.api, email);
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, "medusaQa fixture failed");
  }
}

export const test = base.extend<MedusaQaFixtures, MedusaWorkerFixtures>({
  factorySeed: [
    // eslint-disable-next-line no-empty-pattern -- Playwright worker fixture declares no upstream dependencies
    async ({}, use, workerInfo) => {
      const baseSeed = parsePositiveInt(process.env.P1_SEED, Date.now());
      const seed = baseSeed + workerInfo.parallelIndex;
      setFactorySeed(seed);
      console.log(
        `P1_SEED=${String(baseSeed)} worker=${String(workerInfo.parallelIndex)} seed=${String(seed)}`,
      );
      await use(seed);
    },
    { scope: "worker", auto: true },
  ],

  // eslint-disable-next-line no-empty-pattern -- the auto worker fixture factorySeed seeds the faker; nothing to read
  medusaAdmin: async ({}, use) => {
    const config = loadMedusaConfig();
    const context = await playwrightRequest.newContext({
      baseURL: config.baseUrl,
      timeout: MEDUSA_TIMEOUTS.request,
    });
    try {
      const token = await loginAdminToken(context, config.adminEmail, config.adminPassword);
      await use(createMedusaAdminApi(context, token));
    } finally {
      await context.dispose();
    }
  },

  medusaQa: async ({ factorySeed, medusaAdmin }, use, testInfo) => {
    const config = loadMedusaConfig();
    const prefix = medusaQaPrefix(factorySeed, testInfo.parallelIndex);
    const captured: MedusaQaCapturedIds = { productIds: [], orderIds: [], customerEmails: [] };
    const storeContext = await playwrightRequest.newContext({
      baseURL: config.baseUrl,
      timeout: MEDUSA_TIMEOUTS.request,
    });

    const createProduct: MedusaQaFixture["createProduct"] = async (leaf) => {
      const title = medusaQaTitle(prefix, leaf);
      const created = await medusaAdmin.createProduct({
        title,
        optionTitle: medusaQaOptionTitle(prefix, "Size"),
        amountEur: MEDUSA_QA_UNIT_PRICE,
      });
      captured.productIds.push(created.id);
      return { ...created, title, unitPrice: MEDUSA_QA_UNIT_PRICE };
    };

    const fixture: MedusaQaFixture = {
      prefix,
      api: medusaAdmin,
      createProduct,
      createOrder: async (leaf = "order", quantity = 2) => {
        const product = await createProduct(leaf);
        const email = medusaQaEmail(prefix, `${leaf}-${String(Date.now())}`);
        captured.customerEmails.push(email);
        const [publishableKey, regionId, salesChannelId] = await Promise.all([
          medusaAdmin.getPublishableKey(),
          medusaAdmin.getEuropeRegionId(),
          medusaAdmin.getDefaultSalesChannelId(),
        ]);
        const order = await createStoreOrder(storeContext, {
          publishableKey,
          regionId,
          salesChannelId,
          variantId: product.variantId,
          quantity,
          email,
        });
        captured.orderIds.push(order.id);
        return { ...order, productId: product.id, unitPrice: product.unitPrice };
      },
      captureProductId: (id) => {
        captured.productIds.push(id);
      },
      captureOrderId: (id) => {
        captured.orderIds.push(id);
      },
    };

    try {
      await use(fixture);
    } finally {
      try {
        await runMedusaQaCleanup({ api: medusaAdmin, captured });
      } finally {
        await storeContext.dispose();
      }
    }
  },
});

export { expect } from "@playwright/test";
