import type { Locator } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { MEDUSA_ROUTES } from "../env.js";

export class MedusaOrdersPage extends BasePage {
  readonly heading: Locator = this.page.getByRole("heading", { name: "Orders", level: 1 });

  readonly main: Locator = this.page.getByRole("main");
  readonly searchbox: Locator = this.page.getByRole("searchbox", { name: "Search" });
  readonly orderLinks: Locator = this.page.getByRole("link", { name: /^#\d+$/ });
  // eslint-disable-next-line playwright/no-raw-locators -- the loading skeleton has no role, aria-busy or test id (probe Q-28)
  readonly skeleton: Locator = this.main.locator("[class*=animate-pulse]");

  async goto(): Promise<void> {
    await this.gotoPath(MEDUSA_ROUTES.orders);
  }

  async gotoSearch(query: string): Promise<void> {
    await this.gotoPath(`${MEDUSA_ROUTES.orders}?q=${encodeURIComponent(query)}`);
  }

  resultsSummary(count: number): Locator {
    return this.page.getByText(`${String(count)} of ${String(count)} results`);
  }

  orderLink(displayId: number): Locator {
    return this.page.getByRole("link", { name: `#${String(displayId)}`, exact: true });
  }
}
