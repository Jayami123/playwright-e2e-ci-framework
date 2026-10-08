import { expect, type Locator, type Page } from "@playwright/test";
import { normalizeSlotLabel } from "../../../core/timezone.js";
import { BasePage } from "../../../core/base.page.js";
import { timeouts } from "../env.js";
import { CAL_ROUTES } from "../routes.js";
import { CAL_TEST_IDS } from "../testIds.js";

export class BookingSuccessPage extends BasePage {
  readonly root: Locator;
  private readonly whenDetails: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId(CAL_TEST_IDS.successPage);
    this.whenDetails = this.root
      .getByText(/^when$/i)
      .locator("xpath=following-sibling::div[contains(@class,'col-span-2')][1]");
  }

  async gotoUid(uid: string): Promise<void> {
    await this.gotoPath(CAL_ROUTES.bookingSuccess(uid));
    await this.expectLoaded();
  }

  async expectLoaded(): Promise<void> {
    await expect(this.root).toBeVisible({ timeout: timeouts().page });
    await expect(this.page).toHaveURL(/\/booking\//);
  }

  async readDisplayedStartLabel(): Promise<string> {
    await expect(this.whenDetails).toBeVisible({ timeout: timeouts().page });
    const block = (await this.whenDetails.innerText()).trim();
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const timeLine = lines.find((line) => line.includes(" - ")) ?? lines[lines.length - 1];
    if (timeLine === undefined) {
      throw new Error(`Could not parse when block on success page: ${block}`);
    }
    const startPart = timeLine.split(" - ")[0]?.trim();
    if (startPart === undefined || startPart.length === 0) {
      throw new Error(`Could not parse start time from when block: ${block}`);
    }
    return normalizeSlotLabel(startPart);
  }
}
