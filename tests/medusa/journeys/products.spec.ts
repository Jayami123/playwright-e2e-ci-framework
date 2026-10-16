import { medusaQaOptionTitle, medusaQaTitle } from "../../../src/products/medusa/names.js";
import { MedusaProductsPage } from "../../../src/products/medusa/pages/products.page.js";
import { expect, test } from "../../../src/products/medusa/fixtures.js";

const SIZES = ["S", "M"] as const;
const COLORS = ["Red", "Blue"] as const;

test(
  "P1-MED-FW-002 Create a product with variants via the UI",
  {
    tag: ["@medusa", "@products"],
    annotation: [
      { type: "testId", description: "P1-MED-FW-002" },
      { type: "priority", description: "P0" },
    ],
  },
  async ({ page, medusaQa }) => {
    const products = new MedusaProductsPage(page);
    const title = medusaQaTitle(medusaQa.prefix, "variants");
    const sizeTitle = medusaQaOptionTitle(medusaQa.prefix, "Size");
    const colorTitle = medusaQaOptionTitle(medusaQa.prefix, "Color");

    await test.step("open create dialog", async () => {
      await products.goto();
      await expect(products.heading).toBeVisible();
      await products.openCreate();
    });
    await test.step("fill details", async () => {
      await products.fillDetails(title);
    });
    await test.step("add two options with two values", async () => {
      await products.addOption(sizeTitle, SIZES);
      await products.addOption(colorTitle, COLORS);
    });
    await test.step("continue to variants", async () => {
      await products.continueTo("Organize");
      await products.continueTo("Variants");
    });
    await test.step("publish", async () => {
      const id = await products.publish();
      medusaQa.captureProductId(id);
      await expect(page.getByRole("region", { name: /^Notifications/ })).toContainText(
        `Product ${title} was successfully created.`,
      );
    });
    await test.step("product appears in the list", async () => {
      await products.gotoSearch(title);
      const row = products.row(title);
      await expect(row).toBeVisible();
      await expect(row.getByRole("cell", { name: "4 variants" })).toBeVisible();
      await expect(row.getByRole("cell", { name: "Published" })).toBeVisible();
    });
    await test.step("API returns 4 variants", async () => {
      const found = await medusaQa.api.findProductsByTitle(title);
      expect(found.count).toBe(1);
      const product = found.products[0];
      expect(product?.variants).toHaveLength(4);

      const expectedCombos = SIZES.flatMap((size) =>
        COLORS.map((color) => `${size}/${color}`),
      ).sort();
      const actualCombos = (product?.variants ?? [])
        .map((variant) => {
          const bySize = variant.options.find((o) => o.option?.title === sizeTitle)?.value;
          const byColor = variant.options.find((o) => o.option?.title === colorTitle)?.value;
          return `${bySize ?? "?"}/${byColor ?? "?"}`;
        })
        .sort();
      expect(actualCombos).toEqual(expectedCombos);

      const optionValues = Object.fromEntries(
        (product?.options ?? []).map((o) => [o.title, o.values.map((v) => v.value).sort()]),
      );
      expect(optionValues).toEqual({
        [sizeTitle]: [...SIZES].sort(),
        [colorTitle]: [...COLORS].sort(),
      });
    });
  },
);
