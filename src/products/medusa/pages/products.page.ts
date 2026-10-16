import { expect, type Locator } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { MEDUSA_ROUTES } from "../env.js";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The Create Product page renders two identical dialogs that are both aria-hidden (probe P-22;
 * a11y finding logged in batch 2), so every dialog locator uses `includeHidden: true` and `.last()`.
 */
export class MedusaProductsPage extends BasePage {
  readonly heading: Locator = this.page.getByRole("heading", { name: "Products", level: 1 });
  readonly createLink: Locator = this.page.getByRole("link", { name: "Create" });
  readonly dialog: Locator = this.page
    .getByRole("dialog", { name: "Create Product", includeHidden: true })
    // eslint-disable-next-line playwright/no-nth-methods -- two identical aria-hidden dialogs (probe P-22)
    .last();
  readonly title: Locator = this.dialog.getByLabel("Title", { exact: true });
  readonly variantsSwitch: Locator = this.dialog.getByRole("switch", {
    name: "Yes, this is a product with variants",
    includeHidden: true,
  });
  // Unnamed (probe P-23); the only combobox on the Details tab.
  readonly optionPicker: Locator = this.dialog.getByRole("combobox", { includeHidden: true });
  // The values label is not associated with its input (probe P-23/P-24).
  readonly emptyValuesInput: Locator = this.dialog.getByPlaceholder("Red, Blue, Green");
  readonly continueButton: Locator = this.dialog.getByRole("button", {
    name: "Continue",
    includeHidden: true,
  });
  readonly publishButton: Locator = this.dialog.getByRole("button", {
    name: "Publish",
    includeHidden: true,
  });

  async goto(): Promise<void> {
    await this.gotoPath(MEDUSA_ROUTES.products);
  }

  async gotoSearch(title: string): Promise<void> {
    await this.gotoPath(`${MEDUSA_ROUTES.products}?q=${encodeURIComponent(title)}`);
  }

  row(title: string): Locator {
    return this.page.getByRole("row", { name: new RegExp(`^${escapeRegExp(title)} `) });
  }

  tab(name: string): Locator {
    return this.dialog.getByRole("tab", { name, includeHidden: true });
  }

  async openCreate(): Promise<void> {
    await this.createLink.click();
    await expect(this.title).toBeVisible();
  }

  async fillDetails(title: string): Promise<void> {
    await this.title.fill(title);
  }

  /** Adds a product option with values. `Tab` (never `Escape`) commits the option (probe P-24). */
  async addOption(name: string, values: readonly string[]): Promise<void> {
    if ((await this.variantsSwitch.getAttribute("data-state")) !== "checked") {
      await this.variantsSwitch.click();
    }
    await this.optionPicker.click();
    await this.page.keyboard.type(name);
    await this.page.getByRole("option", { name: `Create "${name}"`, includeHidden: true }).click();
    await this.optionPicker.press("Tab");
    // Only the empty input carries the placeholder; after the first value it keeps focus, so click once.
    await this.emptyValuesInput.click();
    for (const value of values) {
      await this.page.keyboard.type(value);
      await this.page.keyboard.press("Enter");
    }
  }

  async continueTo(tab: "Organize" | "Variants"): Promise<void> {
    await this.continueButton.click();
    await expect(this.tab(tab)).toHaveAttribute("data-state", "active");
  }

  /** Publishes and returns the product id from the POST response. */
  async publish(): Promise<string> {
    const [response] = await Promise.all([
      this.page.waitForResponse(
        (r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/admin/products",
      ),
      this.publishButton.click(),
    ]);
    expect(response.status(), "POST /admin/products").toBe(200);
    const body = (await response.json()) as { product: { id: string } };
    return body.product.id;
  }
}
