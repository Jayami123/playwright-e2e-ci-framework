import type { Locator } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { MED_ERROR } from "../visual.js";

/** The admin's app-wide error boundary (probe Q-22..Q-25). It has no retry control. */
export class MedusaErrorState extends BasePage {
  readonly main: Locator = this.page.getByRole("main");
  readonly message500: Locator = this.page.getByText(MED_ERROR.serverMessage, { exact: true });
  readonly devDetails: Locator = this.page.getByText(MED_ERROR.devDetails);
  readonly shellOrdersLink: Locator = this.page.getByRole("link", { name: "Orders", exact: true });

  title(text: string): Locator {
    return this.page.getByText(text, { exact: true });
  }
}
