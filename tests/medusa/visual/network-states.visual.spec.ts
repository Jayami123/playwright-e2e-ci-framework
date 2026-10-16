import { medusaQaTitle } from "../../../src/products/medusa/names.js";
import { MedusaErrorState } from "../../../src/products/medusa/pages/error-state.page.js";
import { MedusaLoginPage } from "../../../src/products/medusa/pages/login.page.js";
import { MedusaOrderDetailPage } from "../../../src/products/medusa/pages/order-detail.page.js";
import { MedusaOrdersPage } from "../../../src/products/medusa/pages/orders.page.js";
import { MedusaProductsPage } from "../../../src/products/medusa/pages/products.page.js";
import {
  failOrdersList,
  failProductsList,
  holdRequests,
  MED_MOCK_MESSAGE,
  type ProductsFailure,
} from "../../../src/products/medusa/network.js";
import { expect, test } from "../../../src/products/medusa/visual-fixtures.js";
import {
  MED_ERROR,
  MED_ORDERS_LIST_GLOB,
  MED_PRODUCTS_LIST_GLOB,
  MED_STACK_FRAME,
} from "../../../src/products/medusa/visual.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";

/**
 * Console errors a failed list call leaves on the production bundle (Step 0b re-probe, 2026-10-17):
 * the browser's own failed-resource line and the two lines the admin's error boundary logs.
 */
const ALLOWED_FAILURE_CONSOLE = [
  /^console\.error: Failed to load resource: the server responded with a status of 500/,
  /^console\.error: (React Router caught the following error during render )?\w+: P1 mocked failure/,
];

const SETTLE_RENDER =
  "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))";

test.describe("Medusa network states", () => {
  test(
    "P1-MED-VIS-002 Products API 500 shows an error state",
    {
      tag: ["@medusa", "@visual", "@network"],
      annotation: [
        { type: "testId", description: "P1-MED-VIS-002" },
        { type: "priority", description: "P2" },
      ],
    },
    async ({ page, consoleRecorder }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      const products = new MedusaProductsPage(page);
      const error = new MedusaErrorState(page);
      const rows = page.getByRole("row");
      const route = await failProductsList(page, 500);

      await test.step("open products while the list API answers 500", async () => {
        await products.goto();
      });

      await test.step("the error state is shown", async () => {
        // The admin retries once (query-client retry: 1), so exactly two list requests.
        await expect.poll(() => route.hits()).toBe(2);
        await expect(error.title(MED_ERROR.server)).toBeVisible();
        await expect(error.message500).toBeVisible();
        // Asserted again once the error is on screen, so a refetch loop fails here.
        expect(route.hits()).toBe(2);
        await expect(rows).toHaveCount(0);
        await expect(error.shellOrdersLink).toBeVisible();
        expect(new URL(page.url()).pathname).toBe("/app/products");
      });

      await test.step("no stack trace or raw error is shown", async () => {
        await expect(error.devDetails).toHaveCount(0);
        await expect(page.getByText(MED_STACK_FRAME)).toHaveCount(0);
        await expect(page.getByText(MED_MOCK_MESSAGE)).toHaveCount(0);
      });

      await test.step("the console recorder holds the failure and nothing unexpected", () => {
        const entries = consoleRecorder.entries();
        expect(entries.some((entry) => /status of 500/.test(entry))).toBe(true);
        const unexpected = entries.filter(
          (entry) => !ALLOWED_FAILURE_CONSOLE.some((pattern) => pattern.test(entry)),
        );
        expect(unexpected, unexpected.join("\n")).toEqual([]);
      });

      await test.step("reloading after the outage recovers", async () => {
        await page.unroute(MED_PRODUCTS_LIST_GLOB);
        await page.reload();
        await expect(products.heading).toBeVisible();
        await expect.poll(() => rows.count()).toBeGreaterThan(1);
        await expect(error.title(MED_ERROR.server)).toHaveCount(0);
      });
    },
  );

  test(
    "P1-MED-VIS-003 Slow API shows a skeleton, not stale data",
    {
      tag: ["@medusa", "@visual", "@network"],
      annotation: [
        { type: "testId", description: "P1-MED-VIS-003" },
        { type: "priority", description: "P3" },
      ],
    },
    async ({ page, medusaQa }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      const order = await medusaQa.createOrder("slow", 2);
      const productTitle = medusaQaTitle(medusaQa.prefix, "slow");
      const products = new MedusaProductsPage(page);
      const orders = new MedusaOrdersPage(page);
      const error = new MedusaErrorState(page);
      const gate = await holdRequests(page, MED_ORDERS_LIST_GLOB);

      try {
        await test.step("products list shows real data", async () => {
          await products.gotoSearch(productTitle);
          await expect(products.rowWithTitle(productTitle)).toBeVisible();
        });

        await test.step("the orders request is held and the page is opened", async () => {
          gate.arm();
          await error.shellOrdersLink.click();
          await expect(orders.heading).toBeVisible();
          await expect.poll(() => gate.held()).toBeGreaterThan(0);
        });

        await test.step("loading state, no stale data", async () => {
          await expect(orders.skeleton).not.toHaveCount(0);
          await expect(orders.orderLinks).toHaveCount(0);
          await expect(page.getByText(productTitle, { exact: true })).toHaveCount(0);
        });

        await test.step("releasing the request shows the new data", async () => {
          await gate.releaseAll();
          await expect(orders.orderLink(order.displayId)).toBeVisible();
          await expect(orders.skeleton).toHaveCount(0);
          await expect(page.getByText(productTitle, { exact: true })).toHaveCount(0);
        });
      } finally {
        await gate.releaseAll();
      }
    },
  );

  test(
    "P1-MED-FW-X09 Error codes map to visible states",
    {
      tag: ["@medusa", "@visual", "@network"],
      annotation: [
        { type: "testId", description: "P1-MED-FW-X09" },
        { type: "priority", description: "P3" },
      ],
    },
    async ({ page }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      const products = new MedusaProductsPage(page);
      const orders = new MedusaOrdersPage(page);
      const error = new MedusaErrorState(page);
      const rows = page.getByRole("row");
      const cases: readonly { kind: ProductsFailure; title: string; leak?: string }[] = [
        { kind: 403, title: MED_ERROR.generic, leak: "Forbidden" },
        { kind: 429, title: MED_ERROR.generic, leak: "Too many" },
        { kind: "malformed", title: MED_ERROR.generic },
        { kind: "abort", title: MED_ERROR.generic },
        { kind: 404, title: MED_ERROR.notFound, leak: "Not found" },
      ];

      for (const { kind, title, leak } of cases) {
        await test.step(`products list answers ${String(kind)}`, async () => {
          await failProductsList(page, kind);
          await products.goto();
          await expect(error.title(title)).toBeVisible();
          await expect(rows).toHaveCount(0);
          await expect(error.shellOrdersLink).toBeVisible();
          await expect(error.devDetails).toHaveCount(0);
          await expect(page.getByText(MED_STACK_FRAME)).toHaveCount(0);
          if (leak !== undefined) {
            await expect(page.getByText(leak, { exact: true })).toHaveCount(0);
          }
          await page.unroute(MED_PRODUCTS_LIST_GLOB);
        });
      }

      await test.step("401 on a loaded orders list sends the user to login", async () => {
        await orders.goto();
        await expect(orders.heading).toBeVisible();
        await expect(orders.orderLinks).not.toHaveCount(0);
        const route = await failOrdersList(page, 401);
        await orders.searchbox.fill("p1-qa-session-expired");
        await expect(new MedusaLoginPage(page).heading).toBeVisible();
        expect(new URL(page.url()).pathname).toBe("/app/login");
        await expect(orders.orderLinks).toHaveCount(0);
        expect(route.hits()).toBeGreaterThan(0);
      });
    },
  );

  test(
    "P1-MED-FW-X10 Response ordering on search",
    {
      tag: ["@medusa", "@visual", "@network"],
      annotation: [
        { type: "testId", description: "P1-MED-FW-X10" },
        { type: "priority", description: "P3" },
      ],
    },
    async ({ page, medusaQa }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      const token = `${medusaQa.prefix}-race`;
      const first = await medusaQa.createOrder("race1", 2, { lastName: token });
      const second = await medusaQa.createOrder("race2", 2, { lastName: token });
      const orders = new MedusaOrdersPage(page);
      const gate = await holdRequests(page, MED_ORDERS_LIST_GLOB);

      try {
        await test.step("the unfiltered list is loaded", async () => {
          await orders.goto();
          await expect(orders.orderLink(first.displayId)).toBeVisible();
          await expect(orders.orderLink(second.displayId)).toBeVisible();
        });

        await test.step("type the broad token, then the narrow email; both requests are held", async () => {
          gate.arm();
          await orders.searchbox.fill(token);
          await expect.poll(() => gate.held()).toBe(1);
          await orders.searchbox.fill(first.email);
          await expect.poll(() => gate.held()).toBe(2);
        });

        await test.step("release the narrow request first", async () => {
          await gate.releaseNewest();
          await expect(orders.orderLinks).toHaveCount(1);
          await expect(orders.orderLink(first.displayId)).toBeVisible();
        });

        await test.step("a late broad response does not replace it", async () => {
          const late = page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === "/admin/orders" &&
              response.url().includes(encodeURIComponent(token)),
          );
          await gate.releaseAll();
          await late;
          await page.evaluate(SETTLE_RENDER);
          await expect(orders.orderLinks).toHaveCount(1);
          await expect(orders.orderLink(first.displayId)).toBeVisible();
        });
      } finally {
        await gate.releaseAll();
      }
    },
  );

  test(
    "P1-MED-FW-X11 Unknown order id shows not-found, no stale data",
    {
      tag: ["@medusa", "@visual", "@network"],
      annotation: [
        { type: "testId", description: "P1-MED-FW-X11" },
        { type: "priority", description: "P3" },
      ],
    },
    async ({ page, medusaQa }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      const order = await medusaQa.createOrder("idor", 2);
      const detail = new MedusaOrderDetailPage(page);
      const error = new MedusaErrorState(page);

      await test.step("an unknown order id shows the not-found page", async () => {
        await detail.goto("order_P1QADOESNOTEXIST");
        await expect(error.title(MED_ERROR.notFound)).toBeVisible();
      });

      await test.step("a real order opens", async () => {
        await detail.goto(order.id);
        await expect(detail.heading(order.displayId)).toBeVisible();
      });

      await test.step("back shows not-found again, with nothing of the real order", async () => {
        await page.goBack();
        await expect(error.title(MED_ERROR.notFound)).toBeVisible();
        await expect(detail.heading(order.displayId)).toHaveCount(0);
        await expect(page.getByText(order.email)).toHaveCount(0);
      });

      await test.step("forward returns to the real order", async () => {
        await page.goForward();
        await expect(detail.heading(order.displayId)).toBeVisible();
      });
    },
  );

  test(
    "P1-MED-FW-X12 Back after a 500 recovers",
    {
      tag: ["@medusa", "@visual", "@network"],
      annotation: [
        { type: "testId", description: "P1-MED-FW-X12" },
        { type: "priority", description: "P3" },
      ],
    },
    async ({ page }, testInfo) => {
      onlyOnProjects(testInfo.project.name, ["visual-desktop"]);
      const products = new MedusaProductsPage(page);
      const orders = new MedusaOrdersPage(page);
      const error = new MedusaErrorState(page);
      const rows = page.getByRole("row");

      await test.step("products fail with a 500", async () => {
        await failProductsList(page, 500);
        await products.goto();
        await expect(error.title(MED_ERROR.server)).toBeVisible();
      });

      await test.step("leave for orders and lift the outage", async () => {
        await error.shellOrdersLink.click();
        await expect(orders.heading).toBeVisible();
        await page.unroute(MED_PRODUCTS_LIST_GLOB);
      });

      await test.step("back shows the products again", async () => {
        await page.goBack();
        await expect(products.heading).toBeVisible();
        await expect.poll(() => rows.count()).toBeGreaterThan(1);
        await expect(error.title(MED_ERROR.server)).toHaveCount(0);
      });
    },
  );
});
