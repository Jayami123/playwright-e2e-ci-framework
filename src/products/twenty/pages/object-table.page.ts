import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { twentyTimeouts, TWENTY_ROUTES } from "../env.js";

export type TwentyObjectIndex = "pets" | "opportunities";

const INDEX_ROUTES: Record<TwentyObjectIndex, string> = {
  pets: TWENTY_ROUTES.pets,
  opportunities: TWENTY_ROUTES.opportunities,
};

export class TwentyObjectTablePage extends BasePage {
  constructor(
    page: Page,
    private readonly objectKey: TwentyObjectIndex,
  ) {
    super(page);
  }

  async gotoIndex(): Promise<void> {
    await this.gotoPath(INDEX_ROUTES[this.objectKey]);
    await expect(this.page.getByRole("button", { name: "Command Menu" })).toBeVisible({
      timeout: twentyTimeouts().page,
    });
  }

  row(recordId: string): Locator {
    return this.page.getByTestId(`row-id-${recordId}`);
  }

  nameLink(recordId: string, exactName: string): Locator {
    return this.row(recordId).getByRole("link", { name: exactName, exact: true });
  }

  cellWithExactText(recordId: string, expected: string): Locator {
    return this.row(recordId).getByText(expected, { exact: true });
  }

  async rowY(recordId: string): Promise<number> {
    await expect(this.row(recordId)).toBeVisible({ timeout: twentyTimeouts().page });
    await this.row(recordId).scrollIntoViewIfNeeded();
    const box = await this.row(recordId).boundingBox();
    if (box === null) {
      throw new Error(`row-id-${recordId} has no bounding box`);
    }
    return box.y;
  }

  async sortByCloseDateAscending(): Promise<void> {
    await this.page.getByRole("button", { name: "Sort", exact: true }).click();
    const sortDialog = this.page.getByRole("dialog", { name: "Sort" });
    await sortDialog.getByRole("searchbox", { name: "Search fields" }).fill("Close date");
    await sortDialog.getByRole("button", { name: "Close date", exact: true }).click();
  }

  async downloadExportedView(): Promise<string> {
    const commandMenu = this.page.getByRole("button", { name: "Command Menu" });
    await expect(commandMenu).toBeVisible({ timeout: twentyTimeouts().page });
    const downloadPromise = this.page.waitForEvent("download", {
      timeout: twentyTimeouts().page,
    });
    await commandMenu.click({ timeout: twentyTimeouts().action });
    await this.page.getByPlaceholder("Type anything...").fill("Export View");
    await this.page.getByRole("complementary").getByText("Export View", { exact: true }).click();
    const download = await downloadPromise;
    return download.path();
  }
}
