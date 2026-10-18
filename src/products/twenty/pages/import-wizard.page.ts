import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { twentyTimeouts } from "../env.js";

/** People CSV import dialog ("Import data": Upload File, Match Columns, Validate Data). */
export class TwentyImportWizardPage extends BasePage {
  readonly commandMenuButton: Locator;
  readonly importPeopleItem: Locator;
  readonly dialog: Locator;
  readonly selectFileButton: Locator;
  readonly unmatchedColumnButton: Locator;
  readonly primaryEmailOption: Locator;
  readonly nextStepButton: Locator;
  readonly grid: Locator;
  readonly errorsOnlySwitch: Locator;
  readonly tooltip: Locator;
  readonly confirmButton: Locator;
  readonly finishWithErrorsTitle: Locator;
  /** The confirm's Submit sits under aria-hidden, so it has no role (known bug CSV-X07). */
  readonly submitIgnoringErrorsButton: Locator;
  readonly progress: Locator;
  readonly cancelImportButton: Locator;
  readonly tooManyRecordsToast: Locator;
  readonly uploadPrompt: Locator;
  readonly closeButton: Locator;
  readonly exitConfirmButton: Locator;

  constructor(page: Page) {
    super(page);
    this.commandMenuButton = page.getByRole("button", { name: "Command Menu" });
    this.importPeopleItem = page.getByText("Import People", { exact: true });
    this.dialog = page.getByRole("dialog", { name: "Import data" });
    this.selectFileButton = this.dialog.getByRole("button", { name: "Select file" });
    this.unmatchedColumnButton = this.dialog.getByRole("button", { name: "Select column..." });
    this.primaryEmailOption = page.getByRole("option", { name: /^Emails \/ Primary Email/ });
    this.nextStepButton = this.dialog.getByRole("button", { name: "Next Step" });
    this.grid = this.dialog.getByRole("grid");
    this.errorsOnlySwitch = this.dialog.getByRole("switch", { name: "Show only rows with errors" });
    this.tooltip = page.getByRole("tooltip");
    this.confirmButton = this.dialog.getByRole("button", { name: "Confirm" });
    this.finishWithErrorsTitle = page.getByText("Finish flow with errors", { exact: true });
    this.submitIgnoringErrorsButton = page.getByText("Submit", { exact: true });
    this.progress = this.dialog.getByText(/records imported\./);
    this.cancelImportButton = this.dialog.getByRole("button", { name: "Cancel" });
    // Found by text: while the dialog is open the Notifications region is aria-hidden, so a role query finds nothing.
    this.tooManyRecordsToast = page.getByText("Too many records. Up to 10000 allowed", {
      exact: true,
    });
    this.uploadPrompt = this.dialog.getByText("Upload .xlsx, .xls or .csv file");
    this.closeButton = this.dialog.getByRole("button", { name: "Close import" });
    // By text: the confirm sits in a layer that role queries cannot reach (same class as the toast).
    this.exitConfirmButton = page.getByText("Exit", { exact: true });
  }

  importedColumn(label: string): Locator {
    return this.dialog.getByText(label, { exact: true });
  }

  mappedField(label: string): Locator {
    return this.dialog.getByRole("button", { name: label });
  }

  dataRows(): Locator {
    return this.grid
      .getByRole("row")
      .filter({ has: this.page.getByRole("checkbox", { name: "Select" }) });
  }

  cell(text: string): Locator {
    return this.dialog.getByRole("gridcell", { name: text, exact: true });
  }

  /** From the People list: Command Menu, Import People. */
  async open(): Promise<void> {
    await this.commandMenuButton.click();
    await this.importPeopleItem.click();
    await expect(this.dialog).toBeVisible();
  }

  async upload(filePath: string): Promise<void> {
    const chooser = this.page.waitForEvent("filechooser");
    await this.selectFileButton.click();
    await (await chooser).setFiles(filePath);
  }

  async expectImportedColumn(label: string): Promise<void> {
    await expect(this.importedColumn(label)).toBeVisible({ timeout: twentyTimeouts().page });
  }

  async mapEmailsToPrimaryEmail(): Promise<void> {
    await this.unmatchedColumnButton.click();
    await this.primaryEmailOption.click();
    await expect(this.mappedField("Emails / Primary Email")).toBeVisible();
  }

  async nextStep(): Promise<void> {
    await this.nextStepButton.click();
  }

  async expectDataRows(count: number): Promise<void> {
    await expect(this.dataRows()).toHaveCount(count);
  }

  async showErrorsOnly(): Promise<void> {
    await this.errorsOnlySwitch.click();
  }

  async expectCellError(cellText: string, message: string): Promise<void> {
    await this.cell(cellText).hover();
    await expect(this.tooltip).toHaveText(message);
  }

  /** Two rows can carry the same text (duplicate email): hover the first. */
  async expectFirstCellError(cellText: string, message: string): Promise<void> {
    // eslint-disable-next-line playwright/no-nth-methods -- a duplicate flags two identical cells; either shows the tooltip
    await this.cell(cellText).first().hover();
    await expect(this.tooltip).toHaveText(message);
  }

  /** DOM fact for the CSV-X07 evidence: the confirm's Submit sits under an aria-hidden ancestor. */
  async submitIsUnderAriaHidden(): Promise<boolean> {
    return this.submitIgnoringErrorsButton.evaluate(
      (el: { closest: (selector: string) => unknown }) =>
        el.closest('[aria-hidden="true"]') !== null,
    );
  }

  async confirm(): Promise<void> {
    await this.confirmButton.click();
  }

  async submitIgnoringErrors(): Promise<void> {
    await this.submitIgnoringErrorsButton.click();
  }

  async expectClosed(): Promise<void> {
    await expect(this.dialog).toBeHidden({ timeout: twentyTimeouts().page });
  }

  async cancelDuringImport(): Promise<void> {
    await this.cancelImportButton.click();
  }

  async close(): Promise<void> {
    await this.closeButton.click();
    await expect(this.dialog).toBeHidden();
  }

  /** Past the Upload step, Close asks "Exit import flow": confirm it. */
  async closeAndExit(): Promise<void> {
    await this.closeButton.click();
    await this.exitConfirmButton.click();
    await expect(this.dialog).toBeHidden();
  }
}
