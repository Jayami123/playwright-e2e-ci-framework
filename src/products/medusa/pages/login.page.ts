import type { Locator } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { MEDUSA_ROUTES } from "../env.js";

export class MedusaLoginPage extends BasePage {
  readonly heading: Locator = this.page.getByRole("heading", {
    name: "Welcome to Medusa",
    level: 1,
  });
  readonly email: Locator = this.page.getByRole("textbox", { name: "Email" });
  // The password textbox has no accessible name (a11y finding logged in batch 2).
  readonly password: Locator = this.page.getByPlaceholder("Password");
  readonly submit: Locator = this.page.getByRole("button", { name: "Continue with Email" });
  // No role or live region exists on the error (a11y finding logged in batch 2).
  readonly error: Locator = this.page.getByText("Invalid email or password", { exact: true });

  async goto(): Promise<void> {
    await this.gotoPath(MEDUSA_ROUTES.login);
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
