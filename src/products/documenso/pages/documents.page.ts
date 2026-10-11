import { expect, type Locator } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { documensoTeamDocumentsPath, documensoTimeouts } from "../env.js";

export class DocumentsPage extends BasePage {
  addDocumentButton(): Locator {
    return this.page.getByRole("button", { name: "Add a document" });
  }

  async goto(teamUrl: string): Promise<void> {
    await this.gotoPath(documensoTeamDocumentsPath(teamUrl));
    await expect(this.page.getByRole("heading", { name: "Documents" })).toBeVisible({
      timeout: documensoTimeouts().request,
    });
  }

  async upload(pdfPath: string): Promise<void> {
    const fileChooserPromise = this.page.waitForEvent("filechooser");
    await this.addDocumentButton().click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(pdfPath);
    await expect(this.page.getByRole("heading", { name: "Document Editor" })).toBeVisible({
      timeout: documensoTimeouts().journey,
    });
    await expect(this.page).toHaveURL(/\/documents\/[^/]+\/edit/);
  }

  statusBadge(status: "Pending" | "Completed"): Locator {
    return this.page.getByText(status, { exact: true });
  }
}
