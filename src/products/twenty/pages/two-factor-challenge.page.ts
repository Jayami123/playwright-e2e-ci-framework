import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { twentyTimeouts } from "../env.js";

/** The login "Verify code from the app" step shown after the password. */
export class TwentyTwoFactorChallengePage extends BasePage {
  readonly prompt: Locator;
  readonly codeInput: Locator;
  readonly submitButton: Locator;
  readonly invalidCodeToast: Locator;

  constructor(page: Page) {
    super(page);
    this.prompt = page.getByText("Paste the code below");
    this.codeInput = page.getByRole("textbox");
    this.submitButton = page.getByRole("button", { name: "Submit" });
    this.invalidCodeToast = page
      .getByRole("status")
      .filter({ hasText: "Invalid verification code. Please try again." });
  }

  async expectChallenge(): Promise<void> {
    await expect(this.prompt).toBeVisible({ timeout: twentyTimeouts().page });
  }

  async submitCode(code: string): Promise<void> {
    await this.codeInput.fill(code);
    await this.submitButton.click();
  }

  async expectInvalidCode(): Promise<void> {
    await expect(this.invalidCodeToast).toBeVisible();
  }
}
