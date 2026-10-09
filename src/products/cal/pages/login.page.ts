import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { timeouts } from "../env.js";
import { CAL_ROUTES } from "../routes.js";
import { CAL_TEST_IDS } from "../testIds.js";

export class LoginPage extends BasePage {
  readonly form: Locator;
  readonly emailField: Locator;
  readonly passwordField: Locator;
  readonly continueButton: Locator;
  readonly submitButton: Locator;
  readonly lostAccessButton: Locator;

  constructor(page: Page) {
    super(page);
    this.form = page.getByTestId(CAL_TEST_IDS.loginForm);
    this.emailField = this.form.getByRole("textbox", { name: "Email" });
    this.passwordField = this.form.getByRole("textbox", { name: "Password" });
    this.continueButton = this.form.getByRole("button", { name: "Continue" });
    this.submitButton = page.getByRole("button", { name: "Submit" });
    this.lostAccessButton = page.getByRole("button", { name: "Lost access" });
  }

  async goto(): Promise<void> {
    await this.gotoPath(CAL_ROUTES.login);
    await expect(this.form).toBeVisible({ timeout: timeouts().page });
  }

  async continueWithPassword(email: string, password: string): Promise<void> {
    await this.emailField.fill(email);
    await this.passwordField.fill(password);
    await this.continueButton.click();
  }

  async waitForTwoFactorStep(): Promise<void> {
    await expect(this.submitButton).toBeVisible({ timeout: timeouts().page });
  }

  async fillTotpCode(code: string): Promise<void> {
    expect(code, "TOTP code must be exactly six digits").toMatch(/^\d{6}$/);
    await this.waitForTwoFactorStep();
    await this.page.keyboard.type(code);
  }

  async submitTotp(): Promise<void> {
    await this.submitButton.click();
  }

  async clickLostAccess(): Promise<void> {
    await this.lostAccessButton.click();
    await expect(this.backupCodeField()).toBeVisible({ timeout: timeouts().page });
  }

  backupCodeField(): Locator {
    return this.form.filter({ hasText: "Backup code" }).getByRole("textbox");
  }

  async fillBackupCode(formattedCode: string): Promise<void> {
    await this.backupCodeField().fill(formattedCode);
  }

  async submitBackupCode(): Promise<void> {
    await this.submitButton.click();
  }

  incorrectBackupAlert(): Locator {
    return this.page.getByRole("heading", { name: "Backup code is incorrect." });
  }

  async signOut(userDisplayName: string): Promise<void> {
    await this.page.getByRole("button", { name: userDisplayName }).click();
    await this.page.getByRole("menuitem", { name: "Sign out" }).click();
    await this.page.waitForURL(/\/auth\/logout/, { timeout: timeouts().page });
    await this.goto();
  }
}
