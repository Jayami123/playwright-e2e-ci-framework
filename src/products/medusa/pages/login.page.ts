import type { Locator } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { MEDUSA_ROUTES } from "../env.js";

export class MedusaLoginPage extends BasePage {
  readonly heading: Locator = this.page.getByRole("heading", {
    name: "Welcome to Medusa",
    level: 1,
  });
  readonly email: Locator = this.page.getByRole("textbox", { name: "Email" });
  // type=password has no textbox role; the field is labelled (probe Q-36).
  readonly password: Locator = this.page.getByPlaceholder("Password");
  readonly submit: Locator = this.page.getByRole("button", { name: "Continue with Email" });
  // No role or live region exists on the error (a11y finding MED-F-06).
  readonly error: Locator = this.page.getByText("Invalid email or password", { exact: true });
  // Either announcement mechanism satisfies WCAG 4.1.3: an alert, a status or a live region.
  readonly errorAlert: Locator = this.page
    .getByRole("alert")
    .or(this.page.getByRole("status"))
    // eslint-disable-next-line playwright/no-raw-locators -- a bare aria-live region has no role to query (MED-F-06)
    .or(this.page.locator("[aria-live=polite], [aria-live=assertive]"))
    .filter({ hasText: "Invalid email or password" });

  async goto(): Promise<void> {
    await this.gotoPath(MEDUSA_ROUTES.login);
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }
}
