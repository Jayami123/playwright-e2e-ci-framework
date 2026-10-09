import { expect, type Locator, type Page } from "@playwright/test";
import { normalizeSlotLabel, toBookingSuccessWhenLine } from "../../../core/timezone.js";
import { THIRTY_MINUTE_DURATION } from "../factories.js";
import { BasePage } from "../../../core/base.page.js";
import { timeouts } from "../env.js";
import { CAL_ROUTES } from "../routes.js";
import { CAL_TEST_IDS } from "../testIds.js";

export class BookingSuccessPage extends BasePage {
  readonly root: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId(CAL_TEST_IDS.successPage);
  }

  async gotoUid(uid: string): Promise<void> {
    await this.gotoPath(CAL_ROUTES.bookingSuccess(uid));
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await expect(this.root).toBeVisible({ timeout: timeouts().page });
    await expect(this.page).toHaveURL(/\/booking\//);
  }

  async expectDisplayedStart(viewerTimeZone: string, expectedInstant: Date): Promise<string> {
    const whenLine = toBookingSuccessWhenLine(
      expectedInstant,
      THIRTY_MINUTE_DURATION,
      viewerTimeZone,
    );
    await expect(this.root).toContainText(whenLine, { timeout: timeouts().page });
    const startSegment = whenLine.split(" - ")[0] ?? whenLine;
    return normalizeSlotLabel(startSegment);
  }
}
