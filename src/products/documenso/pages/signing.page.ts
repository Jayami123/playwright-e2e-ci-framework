import { expect, type Locator } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { documensoTimeouts } from "../env.js";
import type { DocumensoSentEnvelopeRecord } from "../qa-user.js";
import { clickSigningCanvas, SIGNING_CANVAS_CLICK_OFFSET } from "./signing-canvas.js";

export class SigningPage extends BasePage {
  private fieldCanvas(): Locator {
    // Konva draws the PDF page on a canvas with no ARIA role.
    // eslint-disable-next-line playwright/no-raw-locators -- canvas has no role
    return this.page.locator(".konva-container canvas");
  }

  private fieldClickPosition(
    sent: Pick<
      DocumensoSentEnvelopeRecord,
      "fieldPositionX" | "fieldPositionY" | "fieldWidth" | "fieldHeight"
    >,
    canvasBox: { width: number; height: number },
  ): { x: number; y: number } {
    return {
      x:
        (sent.fieldPositionX / 100) * canvasBox.width +
        ((sent.fieldWidth / 100) * canvasBox.width) / 2,
      y:
        (sent.fieldPositionY / 100) * canvasBox.height +
        ((sent.fieldHeight / 100) * canvasBox.height) / 2,
    };
  }

  async signTypedSignature(
    signatureText: string,
    sent: Pick<
      DocumensoSentEnvelopeRecord,
      "fieldPositionX" | "fieldPositionY" | "fieldWidth" | "fieldHeight"
    >,
  ): Promise<void> {
    await expect(this.page.getByRole("heading", { name: "Sign Document" })).toBeVisible({
      timeout: documensoTimeouts().journey,
    });
    await this.page.getByRole("button", { name: "Next Field" }).click();
    const fieldCanvas = this.fieldCanvas();
    await expect(fieldCanvas).toHaveCount(1, { timeout: documensoTimeouts().journey });
    await clickSigningCanvas(this.page, fieldCanvas, SIGNING_CANVAS_CLICK_OFFSET);
    await this.page.getByTestId("signature-pad-dialog-button").click();
    await this.page.getByRole("tab", { name: "Type" }).click();
    await this.page.getByTestId("signature-pad-type-input").fill(signatureText);
    await this.page.getByRole("button", { name: "Next" }).click();
    await expect(this.page.getByTestId("signature-pad-type-input")).toHaveCount(0);
    const canvasBox = await fieldCanvas.boundingBox();
    if (canvasBox === null) {
      throw new Error("Signing canvas did not return a bounding box");
    }
    const fieldPosition = this.fieldClickPosition(sent, canvasBox);
    await clickSigningCanvas(this.page, fieldCanvas, fieldPosition);
    await expect(this.page.getByRole("navigation").getByText("0 Fields Remaining")).toBeVisible({
      timeout: documensoTimeouts().journey,
    });
  }

  async completeSigning(): Promise<void> {
    await expect(this.page.getByRole("button", { name: "Complete" })).toBeVisible({
      timeout: documensoTimeouts().journey,
    });
    await this.page.getByRole("button", { name: "Complete" }).click();
    await this.page.getByRole("dialog").getByRole("button", { name: "Sign", exact: true }).click();
    await expect(this.page.getByRole("heading", { name: "Document Signed" })).toBeVisible({
      timeout: documensoTimeouts().journey,
    });
  }
}
