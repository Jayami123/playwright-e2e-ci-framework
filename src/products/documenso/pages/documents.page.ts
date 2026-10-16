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
      { timeout: documensoTimeouts().journey },
    );
  }

  private waitForFindDocumentsInternal(): Promise<Response> {
    let findDocumentsRateLimited = false;
    const onResponse = (response: Response): void => {
      if (response.url().includes("document.findDocumentsInternal") && response.status() === 429) {
        findDocumentsRateLimited = true;
      }
    };
    this.page.on("response", onResponse);
    const findDocumentsDone = this.page
      .waitForResponse(
        (response) =>
          response.url().includes("document.findDocumentsInternal") && response.status() === 200,
        { timeout: documensoTimeouts().journey },
      )
      .finally(() => {
        this.page.off("response", onResponse);
      });
    return findDocumentsDone.catch((error: unknown) => {
      if (findDocumentsRateLimited) {
        throw new Error(
          "Documents index rate limited (429): document.findDocumentsInternal returned HTTP 429 (Documenso apiTrpcRateLimit).",
          { cause: error },
        );
      }
      throw error;
    });
  }

  private async assertDocumentsIndexReady(): Promise<void> {
    const timeout = documensoTimeouts().journey;
    await expect(this.page.getByRole("heading", { name: "Team not found" })).toHaveCount(0, {
      timeout,
    });
    await expect(this.page.getByRole("heading", { name: "Documents" })).toBeVisible({ timeout });
    await expect(this.uploadDocumentButton()).not.toHaveAttribute("aria-disabled", "true", {
      timeout,
    });
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
    const findDocumentsDone = this.waitForFindDocumentsInternal();
    const documentsNavigationDone = this.page.waitForURL(documentsUrl, {
      timeout: documensoTimeouts().journey,
    });
    await this.gotoPath(documensoTeamDocumentsPath(teamUrl));
    await Promise.all([limitsDone, documentsNavigationDone, findDocumentsDone]);
    await this.assertDocumentsIndexReady();
  }

  async upload(pdfPath: string): Promise<void> {
    const actionTimeout = documensoTimeouts().journey;
    await expect(this.uploadDocumentButton()).toBeVisible({ timeout: actionTimeout });
    await expect(this.uploadDocumentButton()).not.toHaveAttribute("aria-disabled", "true", {
      timeout: actionTimeout,
    });
    const envelopeCreateDone = this.waitForEnvelopeCreate();
    const [fileChooser] = await Promise.all([
      this.page.waitForEvent("filechooser"),
      this.uploadDocumentButton().click(),
    ]);
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

  titleLink(title: string): Locator {
    return this.page.getByRole("link", { name: title });
  }

  rowActionButton(): Locator {
    return this.page.getByTestId("document-table-action-btn");
  }

  statusBadge(status: "Pending" | "Completed"): Locator {
    return this.page.getByText(status, { exact: true });
  }
}
