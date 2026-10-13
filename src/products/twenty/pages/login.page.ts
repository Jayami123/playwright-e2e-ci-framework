import { expect } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { twentyTimeouts, TWENTY_ROUTES } from "../env.js";

export class TwentyLoginPage extends BasePage {
  async goto(): Promise<void> {
    await this.gotoPath(TWENTY_ROUTES.welcome);
    await expect(this.page).toHaveURL(/\/welcome/);
    await expect(this.page.getByRole("textbox")).toBeVisible({
      timeout: twentyTimeouts().page,
    });
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.page.getByRole("textbox").fill(email);
    await this.page.getByRole("button", { name: "Continue" }).click();
    await this.page.getByPlaceholder("Password").fill(password);
    const signInButton = this.page.getByRole("button", { name: "Sign in" });
    await expect(signInButton).toBeEnabled({ timeout: twentyTimeouts().expect });
    await signInButton.click();
  }
}
