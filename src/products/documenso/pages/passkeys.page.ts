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
    return this.page.getByText("Successfully created passkey", { exact: true });
  }

  removedPasskeyToast(): Locator {
    return this.page.getByText("Passkey has been removed", { exact: true });
  }

  deletePasskeyButtonForName(name: string): Locator {
    return this.page
      .getByRole("row")
      .filter({ has: this.passkeyNameCell(name) })
      .getByRole("button", { name: "Delete" });
  }

  deletePasskeyDialog(): Locator {
    return this.page.getByRole("dialog", { name: "Delete passkey" });
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
    await this.gotoPasskeys();
  }

  async createPasskey(name: string): Promise<void> {
    await this.addPasskeyButton().click();
    const dialog = this.addPasskeyDialog();
    await expect(dialog).toBeVisible({ timeout: documensoTimeouts().request });
    await dialog.getByLabel("Passkey name").fill(name);
    await dialog.getByRole("button", { name: "Continue" }).click();
  }

  async deletePasskey(name: string): Promise<void> {
    await this.deletePasskeyButtonForName(name).click();
    const dialog = this.deletePasskeyDialog();
    await expect(dialog).toBeVisible({ timeout: documensoTimeouts().request });
    await dialog.getByRole("button", { name: "Delete" }).click();
  }
}
