import { type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { TWENTY_ROUTES } from "../env.js";

export type TwentyRecordKind = "pet" | "opportunity";

const RECORD_PATH: Record<TwentyRecordKind, (id: string) => string> = {
  pet: (id) => TWENTY_ROUTES.petRecord(id),
  opportunity: (id) => TWENTY_ROUTES.opportunityRecord(id),
};

export class TwentyRecordPage extends BasePage {
  readonly fieldsWidget: Locator;

  constructor(page: Page) {
    super(page);
    this.fieldsWidget = page.getByTestId("record-fields-widget");
  }

  async goto(kind: TwentyRecordKind, id: string): Promise<void> {
    await this.page.goto(RECORD_PATH[kind](id), { waitUntil: "domcontentloaded" });
  }

  dateValueExact(expected: string): Locator {
    return this.fieldsWidget.getByText(expected, { exact: true });
  }
}
