import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { timeouts } from "../env.js";
import { CAL_ROUTES } from "../routes.js";
import { CAL_TEST_IDS } from "../testIds.js";

export class TwoFactorSettingsPage extends BasePage {
  readonly heading: Locator;
  readonly twoFactorSwitch: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole("heading", { name: "Two-factor authentication" });
    this.twoFactorSwitch = page.getByTestId(CAL_TEST_IDS.twoFactorSwitch);
  }

  async goto(): Promise<void> {
    await this.gotoPath(CAL_ROUTES.twoFactorSettings);
    await expect(this.heading).toBeVisible({ timeout: timeouts().page });
  }

  private enableDialog(): Locator {
    return this.page.getByRole("dialog").filter({
      has: this.page.getByRole("heading", { name: "Enable two-factor authentication" }),
    });
  }

  async openEnableDialog(): Promise<void> {
    await this.twoFactorSwitch.click();
    await expect(this.enableDialog()).toBeVisible({ timeout: timeouts().page });
  }

  async confirmPasswordAndContinue(password: string): Promise<void> {
    const dialog = this.enableDialog();
    await dialog.getByRole("textbox").fill(password);
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(this.page.getByTestId(CAL_TEST_IDS.twoFactorSecret)).toBeVisible({
      timeout: timeouts().page,
    });
  }

  async readSecretFromDialog(): Promise<string> {
    const secret = await this.page.getByTestId(CAL_TEST_IDS.twoFactorSecret).textContent();
    if (secret === null || secret.length !== 32) {
      throw new Error("Two-factor secret must be 32 characters on the settings dialog");
    }
    return secret;
  }

  async continueToOtpEntry(): Promise<void> {
    await this.page.getByTestId(CAL_TEST_IDS.gotoOtpScreen).click();
    await expect(this.page.getByTestId(CAL_TEST_IDS.enable2fa)).toBeVisible({
      timeout: timeouts().page,
    });
  }

  async enterEnrolmentTotp(code: string): Promise<void> {
    if (!/^\d{6}$/.test(code)) {
      throw new Error("Enrolment TOTP must be six digits");
    }
    await this.page.keyboard.type(code);
    await expect(this.page.getByTestId(CAL_TEST_IDS.backupCodesClose)).toBeVisible({
      timeout: timeouts().page,
    });
  }

  async closeBackupCodesDialog(): Promise<void> {
    await this.page.getByTestId(CAL_TEST_IDS.backupCodesClose).click();
    await expect(this.twoFactorSwitch).toHaveAttribute("aria-checked", "true", {
      timeout: timeouts().page,
    });
  }
}
