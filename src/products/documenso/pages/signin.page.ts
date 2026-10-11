import { expect, type Locator, type Page } from "@playwright/test";
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

  async goto(): Promise<void> {
    await this.gotoPath(DOCUMENSO_ROUTES.signin);
    await expect(this.emailField).toBeEditable({ timeout: documensoTimeouts().request });
    await expect(this.signInButton).toBeEnabled({ timeout: documensoTimeouts().request });
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.emailField.fill(email);
    await this.passwordField.fill(password);
    const authorizeDone = this.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(DOCUMENSO_ROUTES.emailPasswordAuthorize),
      { timeout: documensoTimeouts().request },
    );
    await this.signInButton.click();
    const response = await authorizeDone;
    expect(response.status(), "Documenso email-password authorize").toBe(201);
  }
}
