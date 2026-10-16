import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { TWENTY_ROUTES } from "../env.js";

export class TwentySettingsExperiencePage extends BasePage {
  readonly timeZoneValueButton: Locator;
  readonly timeZoneDialog: Locator;

  constructor(page: Page) {
    super(page);
    this.timeZoneDialog = page.getByRole("dialog", { name: "Time zone" });
    // Formats → Time zone value (not Date/Time/Number format buttons): always starts with "(GMT" or "System settings · (GMT".
    this.timeZoneValueButton = page.getByRole("button", {
      name: /^\(GMT|System settings · \(GMT/,
    });
  }

  async goto(): Promise<void> {
    await this.gotoPath(TWENTY_ROUTES.settingsExperience);
  }

  /** Settings -> Experience -> Language value button (shows the current language name). */
  languagePicker(name = "English"): Locator {
    return this.page.getByText(name, { exact: true });
  }

  languageSearch(): Locator {
    return this.page.getByPlaceholder("Search");
  }

  languageOption(name: string): Locator {
    return this.page.getByText(name, { exact: true });
  }

  async openTimeZonePicker(): Promise<void> {
    await this.timeZoneValueButton.click();
    await this.timeZoneDialog.waitFor({ state: "visible" });
  }

  async selectTimeZoneOption(exactLabel: string): Promise<void> {
    await this.openTimeZonePicker();
    const search = this.timeZoneDialog.getByRole("searchbox", { name: "Search" });
    await search.fill(exactLabel.split(" ")[0] ?? exactLabel);
    await this.timeZoneDialog.getByRole("button", { name: exactLabel, exact: true }).click();
  }

  async expectTimeZoneValueLabel(label: string | RegExp): Promise<void> {
    await expect(this.timeZoneValueButton).toHaveText(label);
  }

  async readTimeZoneValueLabel(): Promise<string> {
    const text = await this.timeZoneValueButton.innerText();
    return text.trim();
  }
}
