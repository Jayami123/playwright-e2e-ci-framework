import type { Locator } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { MEDUSA_ROUTES } from "../env.js";

export class MedusaOrdersPage extends BasePage {
  readonly heading: Locator = this.page.getByRole("heading", { name: "Orders", level: 1 });

  async goto(): Promise<void> {
    await this.gotoPath(MEDUSA_ROUTES.orders);
  }

  orderLink(displayId: number): Locator {
    return this.page.getByRole("link", { name: `#${String(displayId)}`, exact: true });
  }
}
