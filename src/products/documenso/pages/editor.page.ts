import { expect, type Locator, type Response } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { documensoTimeouts } from "../env.js";
import { SIGNING_CANVAS_CLICK_OFFSET } from "./signing-canvas.js";

export class EditorPage extends BasePage {
  private sendDocumentButton(): Locator {
    return this.page.getByRole("button", {
      name: "Send Document",
      description: "Send Envelope",
    });
  }

  private fieldCanvas(): Locator {
    // Konva draws the PDF page on a canvas with no ARIA role.
    // eslint-disable-next-line playwright/no-raw-locators -- canvas has no role
    return this.page.locator(".konva-container canvas");
  }

  async addSigner(email: string, name: string): Promise<void> {
    const emailField = this.page.getByLabel("Email");
    const nameField = this.page.getByLabel("Name");
    await expect(emailField).toHaveCount(1);
    await emailField.fill(email);
    await nameField.fill(name);
    await expect.poll(async () => emailField.inputValue()).toBe(email);
  }

  async selectRecipientForFields(recipientLabel: string): Promise<void> {
    const combobox = this.page.getByRole("combobox");
    await combobox.click();
    await this.page.getByRole("option", { name: recipientLabel }).click();
  }

  async addSignatureField(recipientLabel: string): Promise<void> {
    await this.page.getByTestId("envelope-editor-step-addFields").click();
    await this.page.getByRole("button", { name: /example\.pdf/i }).click();
    await this.selectRecipientForFields(recipientLabel);
    await this.page.getByRole("button", { name: "Signature" }).click();
    await expect(this.page.getByText("Page 1 of 1")).toBeVisible({
      timeout: documensoTimeouts().journey,
    });
    const fieldCanvas = this.fieldCanvas();
    await expect(fieldCanvas).toHaveCount(1, { timeout: documensoTimeouts().journey });
    await expect(this.page.getByRole("tooltip")).toBeHidden({
      timeout: documensoTimeouts().request,
    });
    const pageBox = await fieldCanvas.boundingBox();
    if (pageBox === null) {
      throw new Error("PDF page canvas did not return a bounding box");
    }
    await this.page.mouse.click(
      pageBox.x + SIGNING_CANVAS_CLICK_OFFSET.x,
      pageBox.y + SIGNING_CANVAS_CLICK_OFFSET.y,
    );
    await expect(this.page.getByRole("button", { name: /example\.pdf.*1 Field/i })).toBeVisible({
      timeout: documensoTimeouts().journey,
    });
    await expect(this.sendDocumentButton()).toBeEnabled({
      timeout: documensoTimeouts().journey,
    });
  }

  private waitForDistribute(): Promise<Response> {
    return this.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().includes("envelope.distribute"),
      { timeout: documensoTimeouts().journey },
    );
  }

  async send(): Promise<void> {
    const distributeDone = this.waitForDistribute();
    await this.sendDocumentButton().click({ timeout: documensoTimeouts().journey });
    const dialog = this.page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: documensoTimeouts().request });
    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    const distribute = await distributeDone;
    expect(distribute.ok(), `envelope.distribute HTTP ${String(distribute.status())}`).toBeTruthy();
    // After distribute, Documenso client-navigates off the editor to the document page.
    // Returning before that finishes lets a caller's page.goto race it; on Firefox the
    // aborted route-module load makes Documenso reload the page and kill the caller's
    // navigation (NS_BINDING_ABORTED, nightly run 38475954875).
    await expect(this.page).not.toHaveURL(/\/edit(?:\?.*)?$/, {
      timeout: documensoTimeouts().journey,
    });
    await this.page.waitForLoadState("load", { timeout: documensoTimeouts().journey });
  }
}
