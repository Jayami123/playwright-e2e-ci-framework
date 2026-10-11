import { expect } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { documensoTimeouts } from "../env.js";

export class SigningPage extends BasePage {
  async signTypedSignature(signatureText: string): Promise<void> {
    await this.page.getByText("Signature", { exact: true }).click();
    await this.page.getByRole("tab", { name: "Type" }).click();
    const typedInput = this.page.getByTestId("signature-pad-type-input");
    await typedInput.fill(signatureText);
    await this.page.getByRole("button", { name: "Sign", exact: true }).click();
    await expect(this.page.getByRole("button", { name: "Complete" })).toBeEnabled({
      timeout: documensoTimeouts().request,
    });
  }

  async completeSigning(): Promise<void> {
    await this.page.getByRole("button", { name: "Complete" }).click();
    await this.page.getByRole("dialog").getByRole("button", { name: "Sign", exact: true }).click();
    await expect(this.page.getByRole("heading", { name: "Document Signed" })).toBeVisible({
      timeout: documensoTimeouts().journey,
    });
  }
}
