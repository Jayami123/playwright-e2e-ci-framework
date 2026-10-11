import { expect, type Locator, type Response } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { twoFactorEnableFailureMessage } from "../auth.js";
import { DOCUMENSO_ROUTES, documensoTimeouts } from "../env.js";

export class SecuritySettingsPage extends BasePage {
  enableTwoFactorButton(): Locator {
    return this.page.getByRole("button", { name: "Enable 2FA" });
  }

  enableAuthenticatorDialog(): Locator {
    return this.page.getByRole("dialog").filter({ hasText: "Enable Authenticator App" });
  }

  async goto(): Promise<void> {
    await this.gotoPath(DOCUMENSO_ROUTES.security);
    await expect(this.enableTwoFactorButton()).toBeVisible({
      timeout: documensoTimeouts().request,
    });
  }

  async gotoWithTwoFactorEnabled(): Promise<void> {
    await this.gotoPath(DOCUMENSO_ROUTES.security);
    await expect(this.page.getByRole("button", { name: "Disable 2FA" })).toBeVisible({
      timeout: documensoTimeouts().request,
    });
  }

  disableTwoFactorDialog(): Locator {
    return this.page.getByRole("dialog", { name: "Disable 2FA" });
  }

  async openDisableTwoFactorDialog(): Promise<void> {
    await this.page.getByRole("button", { name: "Disable 2FA" }).click();
    await expect(this.disableTwoFactorDialog()).toBeVisible({
      timeout: documensoTimeouts().request,
    });
  }

  async fillDisableTotpCode(code: string): Promise<void> {
    expect(code, "TOTP code must be exactly six digits").toMatch(/^\d{6}$/);
    await this.disableTwoFactorDialog().getByRole("textbox").fill(code);
  }

  private waitForDisableResponse(): Promise<Response> {
    return this.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(DOCUMENSO_ROUTES.twoFactorDisable),
      { timeout: documensoTimeouts().request },
    );
  }

  async submitDisableTwoFactor(): Promise<Response> {
    const disableDone = this.waitForDisableResponse();
    await this.disableTwoFactorDialog()
      .getByRole("button", { name: "Disable 2FA", exact: true })
      .click();
    return await disableDone;
  }

  async openEnableTwoFactorFlow(): Promise<string> {
    const setupDone = this.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(DOCUMENSO_ROUTES.twoFactorSetup) &&
        response.ok(),
      { timeout: documensoTimeouts().request },
    );
    await this.enableTwoFactorButton().click();
    const setupResponse = await setupDone;
    const payload = (await setupResponse.json()) as { secret?: string };
    if (typeof payload.secret !== "string" || payload.secret.length === 0) {
      throw new Error("Enable 2FA setup response did not include secret");
    }
    await expect(this.enableAuthenticatorDialog()).toBeVisible({
      timeout: documensoTimeouts().request,
    });
    await expect(this.page.getByText(payload.secret, { exact: true })).toBeVisible({
      timeout: documensoTimeouts().request,
    });
    return payload.secret;
  }

  async submitEnrolmentToken(code: string, codeMintedAtMs: number): Promise<readonly string[]> {
    expect(code, "TOTP code must be exactly six digits").toMatch(/^\d{6}$/);
    const dialog = this.enableAuthenticatorDialog();
    const tokenField = dialog.getByRole("textbox", { name: "Token" });
    await tokenField.fill(code);
    const enableDone = this.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes(DOCUMENSO_ROUTES.twoFactorEnable),
      { timeout: documensoTimeouts().request },
    );
    await dialog.getByRole("button", { name: "Enable 2FA" }).click();
    const enableResponse = await enableDone;
    let payload: unknown;
    try {
      payload = await enableResponse.json();
    } catch {
      payload = undefined;
    }
    if (!enableResponse.ok()) {
      throw new Error(
        twoFactorEnableFailureMessage(enableResponse.status(), payload, codeMintedAtMs),
      );
    }
    const enableBody = payload as { recoveryCodes?: string[] };
    const codes = enableBody.recoveryCodes;
    if (codes === undefined || codes.length !== 10) {
      throw new Error("Enable 2FA enable response did not include 10 recovery codes");
    }
    for (const backupCode of codes) {
      if (!/^[0-9A-F]{5}-[0-9A-F]{5}$/.test(backupCode)) {
        throw new Error("Enable 2FA recovery code format is invalid");
      }
    }
    await expect(this.page.getByRole("button", { name: "Disable 2FA" })).toBeVisible({
      timeout: documensoTimeouts().request,
    });
    return codes;
  }

  async expectRecoveryCodesSection(): Promise<void> {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await expect(this.page.getByText("Recovery codes", { exact: true })).toBeVisible({
      timeout: documensoTimeouts().request,
    });
  }
}
