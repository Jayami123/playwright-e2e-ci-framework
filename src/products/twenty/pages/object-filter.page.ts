import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { twentyTimeouts } from "../env.js";

export class TwentyObjectFilterPage extends BasePage {
  readonly filterButton: Locator;
  readonly todayChip: Locator;

  constructor(page: Page) {
    super(page);
    this.filterButton = page.getByRole("button", { name: "Filter", exact: true }).filter({
      has: page.getByRole("button", { name: "Filter", exact: true }),
    });
    this.todayChip = page.getByRole("button", { name: /^Close date : Today/ });
  }

  async applyCloseDateIsToday(abbrev: string): Promise<void> {
    await expect(this.filterButton).toBeVisible({ timeout: twentyTimeouts().page });
    await this.filterButton.click({ timeout: twentyTimeouts().action });
    const fieldSearch = this.page.getByRole("textbox", { name: "Search fields" });
    await fieldSearch.fill("Close date");
    await fieldSearch.press("Enter");
    await this.page.getByRole("button", { name: /^Is\b/ }).click();
    await this.page.getByRole("button", { name: `Is today (${abbrev})`, exact: true }).click();
    await expect(this.todayChip).toBeVisible();
  }

  async resetAndExpectChipGone(): Promise<void> {
    await this.page.keyboard.press("Escape");
    await this.resetUnsavedViewEdits();
    await expect(this.todayChip).toHaveCount(0);
  }

  async filterNameContains(value: string): Promise<void> {
    await expect(this.filterButton).toBeVisible({ timeout: twentyTimeouts().page });
    await this.filterButton.click({ timeout: twentyTimeouts().action });
    const fieldSearch = this.page.getByRole("textbox", { name: "Search fields" });
    await fieldSearch.fill("Name");
    await fieldSearch.press("Enter");
    await this.page.getByPlaceholder("Name").fill(value);
    await this.page.keyboard.press("Enter");
  }

  async resetUnsavedViewEdits(): Promise<void> {
    await this.page.getByRole("button", { name: "Reset", exact: true }).click();
  }
}
