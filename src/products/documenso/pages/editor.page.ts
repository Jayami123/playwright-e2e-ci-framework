import { expect, type Response } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { documensoTimeouts } from "../env.js";

export class EditorPage extends BasePage {
  async addSigner(email: string, name: string): Promise<void> {
    const emailField = this.page.getByLabel("Email");
    const nameField = this.page.getByLabel("Name");
    await expect(emailField).toHaveCount(1);
    await emailField.fill(email);
    await nameField.fill(name);
    await expect.poll(async () => emailField.inputValue()).toBe(email);
  }

  async addSignatureField(): Promise<void> {
    await this.page.getByTestId("envelope-editor-step-addFields").click();
    await this.page.getByRole("button", { name: "Signature" }).click();
    const textLayer = this.page.getByText("P1 Documenso example");
    await expect(textLayer).toBeVisible({ timeout: documensoTimeouts().request });
    const box = await textLayer.boundingBox();
    if (box === null) {
      throw new Error("PDF text layer did not return a bounding box");
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    await this.page.mouse.up();
    await expect(this.page.getByRole("button", { name: "Send Document" })).toBeEnabled({
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
    await this.page.getByRole("button", { name: "Send Document" }).click();
    await this.page.getByRole("dialog").getByRole("button", { name: "Send", exact: true }).click();
    const distribute = await distributeDone;
    expect(distribute.ok(), `envelope.distribute HTTP ${String(distribute.status())}`).toBeTruthy();
  }
}
