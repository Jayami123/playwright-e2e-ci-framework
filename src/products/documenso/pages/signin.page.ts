import { expect, type Locator, type Page, type Response } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { DOCUMENSO_ROUTES, documensoTimeouts } from "../env.js";

export class SignInPage extends BasePage {
  readonly emailField: Locator;
  readonly passwordField: Locator;
  readonly signInButton: Locator;

  constructor(page: Page) {
    super(page);
    this.emailField = page.getByLabel("Email");
    this.passwordField = page.getByLabel("Password", { exact: true });
    this.signInButton = page.getByRole("button", { name: "Sign In", exact: true });
  }

  twoFactorDialog(): Locator {
    return this.page.getByRole("dialog", { name: "Two-Factor Authentication" });
  }

  async goto(): Promise<void> {
    await this.gotoPath(DOCUMENSO_ROUTES.signin);
    await expect(this.emailField).toBeEditable({ timeout: documensoTimeouts().request });
    await expect(this.signInButton).toBeEnabled({ timeout: documensoTimeouts().request });
  }

  private waitForAuthorizeResponse(): Promise<Response> {
    return this.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(DOCUMENSO_ROUTES.emailPasswordAuthorize),
      { timeout: documensoTimeouts().request },
    );
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.emailField.fill(email);
    await this.passwordField.fill(password);
    const authorizeDone = this.waitForAuthorizeResponse();
    await this.signInButton.click();
    const response = await authorizeDone;
    expect(response.status(), "Documenso email-password authorize").toBe(201);
  }

  async submitPasswordForTwoFactorDialog(email: string, password: string): Promise<Response> {
    await this.emailField.fill(email);
    await expect(this.emailField).toHaveValue(email);
    await this.passwordField.fill(password);
    const authorizeDone = this.waitForAuthorizeResponse();
    await this.signInButton.click();
    const response = await authorizeDone;
    await expect(this.twoFactorDialog()).toBeVisible({ timeout: documensoTimeouts().request });
    return response;
  }

  async fillTotpToken(code: string): Promise<void> {
    expect(code, "TOTP code must be exactly six digits").toMatch(/^\d{6}$/);
    await this.twoFactorDialog().getByRole("textbox", { name: "Token" }).fill(code);
  }

  async fillBackupCode(code: string): Promise<void> {
    await this.twoFactorDialog().getByLabel("Backup Code").fill(code);
  }

  async clickUseBackupCode(): Promise<void> {
    await this.twoFactorDialog().getByRole("button", { name: "Use Backup Code" }).click();
    await expect(this.twoFactorDialog().getByLabel("Backup Code")).toBeVisible({
      timeout: documensoTimeouts().request,
    });
  }

  async clickUseAuthenticator(): Promise<void> {
    await this.twoFactorDialog().getByRole("button", { name: "Use Authenticator" }).click();
    await expect(this.twoFactorDialog().getByLabel("Token")).toBeVisible({
      timeout: documensoTimeouts().request,
    });
  }

  async submitTwoFactorSignIn(): Promise<Response> {
    const authorizeDone = this.waitForAuthorizeResponse();
    await this.twoFactorDialog().getByRole("button", { name: "Sign In", exact: true }).click();
    return await authorizeDone;
  }
}
