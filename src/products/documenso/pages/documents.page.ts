import { expect, type Locator } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { documensoTeamDocumentsPath, documensoTimeouts } from "../env.js";

export class DocumentsPage extends BasePage {
  private uploadDocumentButton(): Locator {
    return this.page.getByRole("button", { name: "Upload Document" });
  }

  async goto(teamUrl: string): Promise<void> {
    await this.gotoPath(documensoTeamDocumentsPath(teamUrl));
    await expect(this.page.getByRole("heading", { name: "Documents" })).toBeVisible({
      timeout: documensoTimeouts().request,
    });
  }

  async upload(pdfPath: string): Promise<void> {
    const actionTimeout = documensoTimeouts().request;
    await expect(this.page.getByRole("heading", { name: "We're all empty" })).toBeVisible({
      timeout: actionTimeout,
    });
    await expect(this.uploadDocumentButton()).toBeVisible({ timeout: actionTimeout });
    // setInputFiles on the nested 1px dropzone input does not fire onDrop (no envelope.create).
    const [fileChooser] = await Promise.all([
      this.page.waitForEvent("filechooser"),
      this.uploadDocumentButton().click(),
    ]);
    await fileChooser.setFiles(pdfPath);
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
