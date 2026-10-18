import { expect, type Locator } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";

export class TwentyProfilePage extends BasePage {
  async goto(): Promise<void> {
    await this.gotoPath("/settings/profile");
  }

  /** The email is a disabled textbox whose value is the signed-in member's email. */
  emailField(): Locator {
    return this.page.getByRole("textbox", { disabled: true });
  }

  async expectSignedInAs(email: string): Promise<void> {
    await expect(this.emailField()).toHaveValue(email);
  }
}
