import { type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { TWENTY_ROUTES } from "../env.js";

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
}
