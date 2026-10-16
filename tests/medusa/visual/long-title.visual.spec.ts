import type { Locator, Page } from "@playwright/test";
import { MedusaProductsPage } from "../../../src/products/medusa/pages/products.page.js";
import type { MedusaQaFixture } from "../../../src/products/medusa/fixtures.js";
import { medusaQaTitleOfLength } from "../../../src/products/medusa/names.js";
import { expect, test } from "../../../src/products/medusa/visual-fixtures.js";
import { boundingBoxOf, computedStyleOf, scrollSizeOf } from "../../../src/support/visual/dom.js";
import { onlyOnProjects } from "../../../src/support/visual/projects.js";

const PROJECTS = ["visual-desktop", "visual-tablet"] as const;

async function storedTitle(medusaQa: MedusaQaFixture, id: string): Promise<string> {
  const response = await medusaQa.api.raw("GET", `/admin/products/${id}?fields=title`);
  expect(response.status(), "GET /admin/products/{id}").toBe(200);
  return ((await response.json()) as { product: { title: string } }).product.title;
}

/** Steps 3 to 5 of the plan: ellipsis, stable row height, tooltip equals the stored title. */
async function expectTruncatedInList(
  page: Page,
  products: MedusaProductsPage,
  row: Locator,
  shortRow: Locator,
  title: string,
  stored: string,
): Promise<void> {
  const text = products.titleText(row, title);
  await expect(text).toBeVisible();
  expect(await computedStyleOf(text, "textOverflow")).toBe("ellipsis");
  const size = await scrollSizeOf(text);
  expect(size.scrollWidth, "title is cut by the cell").toBeGreaterThan(size.clientWidth);

  const long = await boundingBoxOf("long title row", row);
  const short = await boundingBoxOf("short title row", shortRow);
  expect(long.height, "row height is unchanged by the long title").toBe(short.height);
  const textBox = await boundingBoxOf("long title text", text);
  const cellBox = await boundingBoxOf("title cell", products.titleCell(row, title));
  expect(textBox.x + textBox.width, "text stays inside its cell").toBeLessThanOrEqual(
    cellBox.x + cellBox.width + 1,
  );

  await products.revealTitleTooltip(row, title);
  await expect(products.tooltip).toHaveText(stored);
  await page.keyboard.press("Escape");
  await expect(products.tooltip).toHaveCount(0);
}

test(
  "P1-MED-I18N-002 Long product title truncation in list",
  {
    tag: ["@medusa", "@visual"],
    annotation: [
      { type: "testId", description: "P1-MED-I18N-002" },
      { type: "priority", description: "P2" },
    ],
  },
  async ({ page, medusaQa }, testInfo) => {
    onlyOnProjects(testInfo.project.name, PROJECTS);
    const products = new MedusaProductsPage(page);
    const longTitle = medusaQaTitleOfLength(medusaQa.prefix, 255, "x");
    let longId = "";
    let stored = "";
    let shortTitle = "";

    await test.step("create a 255-char product and a short one", async () => {
      const long = await medusaQa.createProduct(undefined, { exactTitle: longTitle });
      longId = long.id;
      shortTitle = (await medusaQa.createProduct("short")).title;
      stored = await storedTitle(medusaQa, longId);
      expect(stored).toHaveLength(255);
      expect(stored).toBe(longTitle);
    });

    await test.step("open the products list", async () => {
      await products.gotoSearch(medusaQa.prefix);
      await expect(products.rowWithTitle(longTitle)).toBeVisible();
      await expect(products.rowWithTitle(shortTitle)).toBeVisible();
    });

    await test.step("truncated with an ellipsis, stable row height, full tooltip", async () => {
      await expectTruncatedInList(
        page,
        products,
        products.rowWithTitle(longTitle),
        products.rowWithTitle(shortTitle),
        longTitle,
        stored,
      );
    });
  },
);

test(
  "P1-MED-FW-X14 Title boundaries 254/256/multi-byte",
  {
    tag: ["@medusa", "@visual"],
    annotation: [
      { type: "testId", description: "P1-MED-FW-X14" },
      { type: "priority", description: "P3" },
    ],
  },
  async ({ page, medusaQa }, testInfo) => {
    onlyOnProjects(testInfo.project.name, PROJECTS);
    test.setTimeout(240_000);
    const products = new MedusaProductsPage(page);
    const words = "Donaudampfschifffahrt Gesellschaft Kapitän Mütze ";
    // A trailing space would not survive Playwright's exact text match; the length stays 255.
    const titles: Readonly<Record<string, string>> = {
      "254 chars": medusaQaTitleOfLength(medusaQa.prefix, 254, "x"),
      "256 chars": medusaQaTitleOfLength(medusaQa.prefix, 256, "x"),
      "255 umlauts": medusaQaTitleOfLength(medusaQa.prefix, 255, "ä"),
      "255 UTF-16 units with emoji": medusaQaTitleOfLength(medusaQa.prefix, 255, "😀"),
      "255 German words": medusaQaTitleOfLength(medusaQa.prefix, 255, words).replace(/\s$/, "x"),
    };
    const stored: Record<string, string> = {};
    let shortTitle = "";

    await test.step("create the boundary products and a short one", async () => {
      for (const [label, title] of Object.entries(titles)) {
        const created = await medusaQa.createProduct(undefined, { exactTitle: title });
        stored[label] = await storedTitle(medusaQa, created.id);
        expect(stored[label], `${label} is stored as sent`).toBe(title);
      }
      shortTitle = (await medusaQa.createProduct("short")).title;
    });

    await test.step("open the products list", async () => {
      await products.gotoSearch(medusaQa.prefix);
      await expect(products.rowWithTitle(shortTitle)).toBeVisible();
    });

    for (const [label, title] of Object.entries(titles)) {
      await test.step(label, async () => {
        await expectTruncatedInList(
          page,
          products,
          products.rowWithTitle(title),
          products.rowWithTitle(shortTitle),
          title,
          stored[label] ?? title,
        );
      });
    }
  },
);
