import { expect, type Locator, type Response } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { documensoTeamDocumentsPath, documensoTimeouts } from "../env.js";

export class DocumentsPage extends BasePage {
  private uploadDocumentButton(): Locator {
    return this.page.getByRole("button", { name: "Upload Document" });
  }

  private waitForLimits(): Promise<Response> {
    return this.page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes("/api/limits") &&
        response.status() === 200,
      { timeout: documensoTimeouts().request },
    );
  }

  private waitForEnvelopeCreate(): Promise<Response> {
    return this.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().includes("envelope.create"),
      { timeout: documensoTimeouts().request },
    );
  }

  async goto(teamUrl: string): Promise<void> {
    const documentsUrl = new RegExp(`/t/${teamUrl}/documents(?:\\?.*)?$`);
    const limitsDone = this.waitForLimits();
    const documentsNavigationDone = this.page.waitForURL(documentsUrl, {
      timeout: documensoTimeouts().journey,
    });
    await this.gotoPath(documensoTeamDocumentsPath(teamUrl));
    await Promise.all([documentsNavigationDone, limitsDone]);
    await expect(this.page.getByRole("heading", { name: "Documents" })).toBeVisible({
      timeout: documensoTimeouts().journey,
    });
    await expect(this.uploadDocumentButton()).not.toHaveAttribute("aria-disabled", "true", {
      timeout: documensoTimeouts().journey,
    });
  }

  async upload(pdfPath: string): Promise<void> {
    const actionTimeout = documensoTimeouts().journey;
    await expect(this.uploadDocumentButton()).toBeVisible({ timeout: actionTimeout });
    await expect(this.uploadDocumentButton()).not.toHaveAttribute("aria-disabled", "true", {
      timeout: actionTimeout,
    });
    // EnvelopeUploadButton is in FolderGrid; it does not depend on the documents
    // table. Waiting for empty/Select row blocked until findDocumentsInternal
    // resolved and, after earlier FW tests, the page ended on Team not found.
    // setInputFiles on the nested 1px dropzone input does not fire onDrop (no envelope.create).
    const [fileChooser] = await Promise.all([
      this.page.waitForEvent("filechooser"),
      this.uploadDocumentButton().click(),
    ]);
    const envelopeCreateDone = this.waitForEnvelopeCreate();
    await fileChooser.setFiles(pdfPath);
    const createResponse = await envelopeCreateDone;
    const createStatus = createResponse.status();
    if (createStatus !== 200) {
      const createBody = await createResponse.text();
      throw new Error(`envelope.create HTTP ${String(createStatus)}: ${createBody}`);
    }
    await expect(this.page).toHaveURL(/\/documents\/[^/]+\/edit/, {
      timeout: actionTimeout,
    });
    await expect(this.page.getByTestId("envelope-editor-step-addFields")).toBeVisible({
      timeout: actionTimeout,
    });
  }

  statusBadge(status: "Pending" | "Completed"): Locator {
    return this.page.getByText(status, { exact: true });
  }
}
