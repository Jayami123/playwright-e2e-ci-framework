import { expect, type Locator } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { DOCUMENSO_ROUTES, documensoTimeouts } from "../env.js";

export class PasskeysSettingsPage extends BasePage {
  managePasskeysLink(): Locator {
    return this.page.getByRole("link", { name: "Manage passkeys" });
  }

  passkeysHeading(): Locator {
    return this.page.getByRole("heading", { name: "Passkeys", level: 2 });
  }

  addPasskeyButton(): Locator {
    return this.page.getByRole("button", { name: "Add passkey" });
  }

  addPasskeyDialog(): Locator {
    return this.page.getByRole("dialog", { name: "Add passkey" });
  }

  passkeyNameCell(name: string): Locator {
    return this.page.getByRole("cell", { name });
  }

  createdPasskeyToast(): Locator {
    return this.page.getByText("Successfully created passkey");
  }

  async gotoPasskeys(): Promise<void> {
    await this.gotoPath(DOCUMENSO_ROUTES.securityPasskeys);
    await expect(this.passkeysHeading()).toBeVisible({
      timeout: documensoTimeouts().request,
    });
  }

  async openFromSecuritySettings(): Promise<void> {
    await expect(this.managePasskeysLink()).toBeVisible({
      timeout: documensoTimeouts().request,
    });
    await Promise.all([
      this.page.waitForURL(/\/settings\/security\/passkeys$/, {
        timeout: documensoTimeouts().request,
      }),
      this.managePasskeysLink().click(),
    ]);
    await expect(this.passkeysHeading()).toBeVisible({
      timeout: documensoTimeouts().request,
    });
  }

  async createPasskey(name: string): Promise<void> {
    await this.addPasskeyButton().click();
    const dialog = this.addPasskeyDialog();
    await expect(dialog).toBeVisible({ timeout: documensoTimeouts().request });
    await dialog.getByLabel("Passkey name").fill(name);
    await dialog.getByRole("button", { name: "Continue" }).click();
  }
}
