import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { assertTotpSecretShape } from "../fixtures/two-factor.js";
import { twentyTimeouts } from "../env.js";

const PROFILE_PATH = "/settings/profile";

/** Settings > Profile "Two Factor Authentication": the TOTP enrolment page and the Reset modal. */
export class TwentyTwoFactorSettingsPage extends BasePage {
  readonly authenticatorCard: Locator;
  readonly setupKeyButton: Locator;
  readonly codeInput: Locator;
  readonly saveButton: Locator;
  readonly enabledToast: Locator;
  readonly resetButton: Locator;
  readonly resetDoneToast: Locator;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    super(page);
    this.authenticatorCard = page.getByText("Authenticator App", { exact: true });
    this.setupKeyButton = page.getByRole("button", { name: "setup key" });
    this.codeInput = page.getByRole("textbox");
    this.saveButton = page.getByRole("button", { name: "Save" });
    this.enabledToast = page
      .getByRole("status")
      .filter({ hasText: "Two-factor authentication setup completed successfully!" });
    this.resetButton = page.getByRole("button", { name: "Reset 2FA" });
    this.resetDoneToast = page
      .getByRole("status")
      .filter({ hasText: "2FA Method has been deleted successfully." });
    this.logoutButton = page.getByRole("button", { name: "Logout" });
  }

  status(text: "Active" | "Deactivated"): Locator {
    return this.page.getByText(text, { exact: true });
  }

  resetEmailInput(email: string): Locator {
    return this.page.getByRole("textbox", { name: email });
  }

  async gotoProfile(): Promise<void> {
    await this.gotoPath(PROFILE_PATH);
    await expect(this.authenticatorCard).toBeVisible({ timeout: twentyTimeouts().page });
  }

  async openAuthenticatorApp(): Promise<void> {
    await this.authenticatorCard.click();
    await expect(this.page).toHaveURL(/\/settings\/profile\/two-factor-authentication\/TOTP/);
  }

  /** The UI shows no secret as text; the "setup key" button copies it to the clipboard (probe A-03). */
  async readSetupKey(): Promise<string> {
    await this.setupKeyButton.click();
    const secret = await this.page.evaluate<string>("navigator.clipboard.readText()");
    return assertTotpSecretShape(secret);
  }

  /** Click and type once: `fill` after an earlier value sends a stale value (probe A-05). */
  async typeCode(code: string): Promise<void> {
    await this.codeInput.click();
    await this.codeInput.pressSequentially(code);
  }

  async save(): Promise<void> {
    await this.saveButton.click();
  }

  async expectEnabled(): Promise<void> {
    await expect(this.enabledToast).toBeVisible();
    await expect(this.page).toHaveURL(/\/settings\/profile$/);
    await expect(this.status("Active")).toBeVisible();
  }

  async resetWithEmail(email: string): Promise<void> {
    await this.resetEmailInput(email).fill(email);
    await this.resetButton.click();
  }

  async logout(): Promise<void> {
    await this.logoutButton.click();
    await expect(this.page).toHaveURL(/\/welcome/, { timeout: twentyTimeouts().navigation });
  }
}
