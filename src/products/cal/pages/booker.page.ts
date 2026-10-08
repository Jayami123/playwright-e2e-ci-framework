import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { CAL_ROUTES, PRO_THIRTY_MIN_SLUG } from "../routes.js";
import { CAL_TEST_IDS } from "../testIds.js";

export class BookerPage extends BasePage {
  readonly container: Locator;

  constructor(page: Page) {
    super(page);
    this.container = page.getByTestId(CAL_TEST_IDS.bookerContainer);
  }

  async gotoProThirtyMin(): Promise<void> {
    await this.gotoPath(
      CAL_ROUTES.publicBooker(PRO_THIRTY_MIN_SLUG.user, PRO_THIRTY_MIN_SLUG.event),
    );
  }

  async expectLoaded(): Promise<void> {
    await expect(this.container).toBeVisible();
  }
}
