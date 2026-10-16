import { expect, type Locator } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { documensoTimeouts } from "../env.js";
import type { DocumensoSentEnvelopeRecord } from "../qa-user.js";
import { clickSigningCanvas } from "./signing-canvas.js";

export class SigningPage extends BasePage {
  signDocumentHeading(): Locator {
    return this.page.getByRole("heading", { name: "Sign Document" });
  }

  nextFieldButton(): Locator {
    return this.page.getByRole("button", { name: "Next Field" });
  }

  private fieldCanvas(): Locator {
    return this.pdfCanvas();
  }

  pdfCanvas(): Locator {
    // Konva draws the PDF page on a canvas with no ARIA role.
    // eslint-disable-next-line playwright/no-raw-locators -- canvas has no role
    return this.page.locator(".konva-container canvas");
  }

  /** Step 0: two Complete/Abschließen buttons exist; one is hidden (0x0). */
  visibleCompleteButton(name: string = "Complete"): Locator {
    return this.page.getByRole("button", { name, exact: true }).filter({ visible: true });
  }

  headerTitle(): Locator {
    return this.page.getByRole("heading", { level: 1 }).filter({ visible: true });
  }

  fullNameInput(): Locator {
    // The desktop sidebar and the mobile widget both render the field; only one is visible.
    // The "Full Name" label is a plain text node, not associated with the input, so the textbox has no name.
    return this.page.getByRole("textbox").filter({ visible: true });
  }

  async expandMobileWidget(): Promise<void> {
    await this.page.getByRole("button", { name: "Expand" }).click();
  }

  async gotoAndWaitForPdf(signPath: string): Promise<void> {
    await this.page.goto(signPath, { waitUntil: "domcontentloaded" });
    await expect(this.pdfCanvas()).toHaveCount(1, { timeout: documensoTimeouts().journey });
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
    await expect(this.signDocumentHeading()).toBeVisible({
      timeout: documensoTimeouts().journey,
    });
    await this.nextFieldButton().click();
    const fieldCanvas = this.fieldCanvas();
    await expect(fieldCanvas).toHaveCount(1, { timeout: documensoTimeouts().journey });
    const initialCanvasBox = await fieldCanvas.boundingBox();
    if (initialCanvasBox === null) {
      throw new Error("Signing canvas did not return a bounding box");
    }
    await clickSigningCanvas(fieldCanvas, this.fieldClickPosition(sent, initialCanvasBox));
    const signatureDialog = this.page.getByRole("dialog");
    await expect(signatureDialog).toBeVisible({
      timeout: documensoTimeouts().journey,
    });
    await signatureDialog.getByRole("tab", { name: "Type" }).click();
    await signatureDialog.getByTestId("signature-pad-type-input").fill(signatureText);
    await signatureDialog.getByRole("button", { name: "Sign", exact: true }).click();
    await expect(signatureDialog).toHaveCount(0, {
      timeout: documensoTimeouts().journey,
    });
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
