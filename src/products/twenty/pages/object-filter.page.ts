import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { twentyTimeouts } from "../env.js";

/** Step 0 2026-10-15: one Escape leaves the floating-ui portal (listbox) mounted; a second closes it. */
const FLOATING_PORTAL = "[data-floating-ui-portal]";
const MAX_PORTAL_ESCAPES = 3;

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

  async closeFloatingPortals(): Promise<void> {
    // ADR 0006 rule gap: no-raw-locators flags string literals only; the portal has no role or test id of its own.
    const portals = this.page.locator(FLOATING_PORTAL);
    for (let i = 0; i < MAX_PORTAL_ESCAPES && (await portals.count()) > 0; i += 1) {
      await this.page.keyboard.press("Escape");
    }
    await expect(portals).toHaveCount(0, { timeout: twentyTimeouts().action });
  }

  async resetAndExpectChipGone(): Promise<void> {
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
    await this.closeFloatingPortals();
    await this.page.getByRole("button", { name: "Reset", exact: true }).click();
  }
}
