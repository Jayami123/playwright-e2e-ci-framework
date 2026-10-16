import type { Locator } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { MEDUSA_ROUTES } from "../env.js";

export class MedusaOrderDetailPage extends BasePage {
  readonly main: Locator = this.page.getByRole("main");
  readonly summaryHeading: Locator = this.main.getByRole("heading", {
    name: "Summary",
    level: 2,
  });
  // eslint-disable-next-line playwright/no-raw-locators, playwright/no-nth-methods -- the header menu trigger has no accessible name and is the first of 4 triggers (a11y finding logged in batch 2)
  readonly actionsMenuButton: Locator = this.main.locator("[aria-haspopup=menu]").first();
  readonly cancelMenuItem: Locator = this.page.getByRole("menuitem", { name: "Cancel" });
  readonly confirmDialog: Locator = this.page.getByRole("alertdialog", { name: "Are you sure?" });
  readonly confirmButton: Locator = this.confirmDialog.getByRole("button", { name: "Continue" });

  async goto(orderId: string): Promise<void> {
    await this.gotoPath(MEDUSA_ROUTES.order(orderId));
  }

  heading(displayId: number): Locator {
    return this.page.getByRole("heading", { name: `#${String(displayId)}`, level: 1 });
  }

  /**
   * Summary rows are bare div/p pairs with no roles or test ids. In document order the innermost
   * div that holds both the label and a euro amount is the last match.
   */
  totalRow(label: string): Locator {
    // eslint-disable-next-line playwright/no-raw-locators -- bare div rows without roles (probe P-35)
    const divs = this.main.locator("div");
    return (
      divs
        .filter({ has: this.page.getByText(label, { exact: true }) })
        .filter({ hasText: /€\s?\d/ })
        // eslint-disable-next-line playwright/no-nth-methods -- innermost matching row, see above
        .last()
    );
  }

  statusText(text: string): Locator {
    return this.main.getByText(text, { exact: true });
  }

  toast(text: string): Locator {
    return this.page.getByRole("region", { name: /^Notifications/ }).getByText(text);
  }

  async openCancel(): Promise<void> {
    await this.actionsMenuButton.click();
    await this.cancelMenuItem.click();
  }

  async confirmCancel(): Promise<void> {
    await this.confirmButton.click();
  }
}
