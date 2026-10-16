import type { Page, Route } from "@playwright/test";
import {
  MED_FLAG_GLOB,
  MED_FLAG_STUB_SVG,
  MED_ORDERS_LIST_GLOB,
  MED_PRODUCTS_LIST_GLOB,
} from "./visual.js";

export type ProductsFailure = 500 | 401 | 403 | 404 | 429 | "malformed" | "abort";

export const MED_MOCK_MESSAGE = "P1 mocked failure";

const JSON_FAILURES: Readonly<
  Record<Exclude<ProductsFailure, "malformed" | "abort">, Record<string, string>>
> = {
  500: { type: "unknown_error", message: MED_MOCK_MESSAGE },
  401: { message: "Unauthorized" },
  403: { type: "not_allowed", message: "Forbidden" },
  404: { type: "not_found", message: "Not found" },
  429: { type: "too_many_requests", message: "Too many" },
};

export interface RouteHits {
  hits(): number;
}

async function answer(route: Route, kind: ProductsFailure): Promise<void> {
  if (kind === "abort") {
    await route.abort("failed");
  } else if (kind === "malformed") {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{not json" });
  } else {
    await route.fulfill({
      status: kind,
      contentType: "application/json",
      body: JSON.stringify(JSON_FAILURES[kind]),
    });
  }
}

/** Fails only the products list call (probe Q-22). Counts every request the admin makes to it. */
export async function failProductsList(page: Page, kind: ProductsFailure): Promise<RouteHits> {
  let hits = 0;
  await page.route(MED_PRODUCTS_LIST_GLOB, async (route) => {
    hits += 1;
    await answer(route, kind);
  });
  return { hits: () => hits };
}

/** Fails the orders list call, e.g. 401 after the page is already loaded (probe Q-34). */
export async function failOrdersList(page: Page, status: 401): Promise<RouteHits> {
  let hits = 0;
  await page.route(MED_ORDERS_LIST_GLOB, async (route) => {
    hits += 1;
    await answer(route, status);
  });
  return { hits: () => hits };
}

export interface RequestGate {
  /** From now on, matching requests are held instead of continued. */
  arm(): void;
  held(): number;
  /** Continues every held request, oldest first. */
  releaseAll(): Promise<void>;
  /** Continues only the most recent held request. */
  releaseNewest(): Promise<void>;
}

/**
 * Holds matching requests until the test releases them. There is no timer: the request stays pending
 * exactly as long as the assertions need (plan D4). Unarmed, requests pass straight through.
 */
export async function holdRequests(page: Page, glob: string): Promise<RequestGate> {
  let armed = false;
  const pending: Route[] = [];

  async function release(route: Route): Promise<void> {
    // The page may already be gone when a `finally` releases the gate; a closed route is not a failure.
    await route.continue().catch(() => undefined);
  }

  await page.route(glob, async (route) => {
    if (armed) {
      pending.push(route);
    } else {
      await route.continue();
    }
  });

  return {
    arm: () => {
      armed = true;
    },
    held: () => pending.length,
    releaseAll: async () => {
      armed = false;
      for (const route of pending.splice(0)) {
        await release(route);
      }
    },
    releaseNewest: async () => {
      const route = pending.pop();
      if (route !== undefined) {
        await release(route);
      }
    },
  };
}

export async function stubFlagImages(page: Page): Promise<void> {
  await page.route(MED_FLAG_GLOB, async (route) => {
    await route.fulfill({ status: 200, contentType: "image/svg+xml", body: MED_FLAG_STUB_SVG });
  });
}
