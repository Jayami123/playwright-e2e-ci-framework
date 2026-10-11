import { expect, type Locator } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { documensoTeamDocumentsPath, documensoTimeouts } from "../env.js";

export class DocumentsPage extends BasePage {
  private uploadDocumentButton(): Locator {
    return this.page.getByRole("button", { name: "Upload Document" });
  }

  private uploadFileInput(): Locator {
    // File inputs have no ARIA role; react-dropzone hides this input inside the Upload Document button.
    // eslint-disable-next-line playwright/no-raw-locators -- file input has no role
    return this.uploadDocumentButton().locator('input[type="file"]');
  }

  async goto(teamUrl: string): Promise<void> {
    await this.gotoPath(documensoTeamDocumentsPath(teamUrl));
    await expect(this.page.getByRole("heading", { name: "Documents" })).toBeVisible({
      timeout: documensoTimeouts().request,
    });
  }

  async upload(pdfPath: string): Promise<void> {
    const actionTimeout = documensoTimeouts().request;
    await expect(this.uploadDocumentButton()).toBeVisible({ timeout: actionTimeout });
    await this.uploadFileInput().setInputFiles(pdfPath);
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
