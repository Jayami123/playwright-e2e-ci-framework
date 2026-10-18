import { expect, type Locator, type Page, type Response } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { TWENTY_ROUTES } from "../env.js";
import { waitForLiveSubscription } from "./live-subscription.js";

export type TwentyRecordKind = "pet" | "opportunity" | "person" | "company";

const RECORD_PATH: Record<TwentyRecordKind, (id: string) => string> = {
  pet: (id) => TWENTY_ROUTES.petRecord(id),
  opportunity: (id) => TWENTY_ROUTES.opportunityRecord(id),
  person: (id) => TWENTY_ROUTES.personRecord(id),
  company: (id) => TWENTY_ROUTES.companyRecord(id),
};

export class TwentyRecordPage extends BasePage {
  readonly fieldsWidget: Locator;

  constructor(page: Page) {
    super(page);
    this.fieldsWidget = page.getByTestId("record-fields-widget");
  }

  async goto(kind: TwentyRecordKind, id: string): Promise<void> {
    await this.gotoPath(RECORD_PATH[kind](id));
  }

  /** The record query of this page; register before goto(). */
  liveSubscription(kind: TwentyRecordKind, id: string): Promise<Response> {
    return waitForLiveSubscription(this.page, `record-show-${kind}-${id}`);
  }

  /** The record name heading (Companies, Opportunities). */
  title(name: string): Locator {
    return this.page.getByRole("heading", { level: 3, name, exact: true });
  }

  /** Hover, click, then the Name textbox opens; returns it. */
  async openTitleEditor(name: string): Promise<Locator> {
    const heading = this.title(name);
    await heading.hover();
    await heading.click();
    const box = this.page.getByPlaceholder("Name");
    await expect(box).toBeVisible();
    return box;
  }

  fieldValue(text: string): Locator {
    return this.fieldsWidget.getByText(text, { exact: true });
  }

  /** Opens the inline editor of the field that currently shows `shown`; returns its textbox. `baseCount` is how many
   * copies of `shown` exist before the hover (an empty field shows its label as the value, so Amount has 2). */
  async openFieldEditor(shown: string, placeholder: string, baseCount = 1): Promise<Locator> {
    const value = this.fieldValue(shown);
    // A previous editor leaves its hover-portal copy behind until the mouse moves away.
    await this.page.mouse.move(0, 0);
    await expect(value).toHaveCount(baseCount);
    // eslint-disable-next-line playwright/no-nth-methods -- an empty field shows its label too; the value is the later copy
    await value.last().hover();
    // The hover portal duplicates the value about 74 ms later.
    await expect(value).toHaveCount(baseCount + 1);
    // eslint-disable-next-line playwright/no-nth-methods -- the hover portal duplicates the value; the copy on top is the clickable one
    await value.last().click();
    const box = this.page.getByPlaceholder(placeholder);
    await expect(box).toBeVisible();
    return box;
  }

  get deletedBanner(): Locator {
    return this.page.getByText("This record has been deleted", { exact: true });
  }

  get restoreText(): Locator {
    return this.page.getByText("Restore", { exact: true });
  }

  dateValueExact(expected: string): Locator {
    return this.fieldsWidget.getByText(expected, { exact: true });
  }
}
