import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { calendarMonthHeading, monthClicksFromHeading } from "../display.js";
import { twentyTimeouts, TWENTY_ROUTES } from "../env.js";

export class TwentyObjectCalendarPage extends BasePage {
  readonly nextPeriod: Locator;
  readonly previousPeriod: Locator;
  readonly monthHeading: Locator;
  readonly viewPicker: Locator;

  constructor(page: Page) {
    super(page);
    this.nextPeriod = page.getByRole("button", { name: "Next period" });
    this.previousPeriod = page.getByRole("button", { name: "Previous period" });
    this.monthHeading = page.getByRole("button", {
      name: /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/,
    });
    this.viewPicker = page.getByRole("button", { name: /^All Opportunities/ });
  }

  async gotoOpportunitiesIndex(): Promise<void> {
    await this.gotoPath(TWENTY_ROUTES.opportunities);
    await expect(this.viewPicker).toBeVisible({ timeout: twentyTimeouts().page });
  }

  recordCard(exactName: string): Locator {
    return this.page.getByRole("link", { name: exactName, exact: true });
  }

  dayNumber(day: number): Locator {
    return this.page.getByText(String(day), { exact: true });
  }

  async readMonthHeading(): Promise<string> {
    const text = await this.monthHeading.innerText();
    return text.trim();
  }

  async goToMonth(targetYear: number, targetMonth: number): Promise<void> {
    const heading = await this.readMonthHeading();
    const delta = monthClicksFromHeading(heading, targetYear, targetMonth);
    const button = delta >= 0 ? this.nextPeriod : this.previousPeriod;
    const times = Math.abs(delta);
    const clicks = Array.from({ length: times }, () => button);
    for (const loc of clicks) {
      await loc.click();
    }
    await expect(this.monthHeading).toHaveText(
      new RegExp(`^${calendarMonthHeading(targetYear, targetMonth)}\\b`),
    );
  }

  async createCloseDateCalendarView(viewName: string): Promise<string> {
    await expect(this.viewPicker).toBeVisible({ timeout: twentyTimeouts().page });
    await this.viewPicker.click({ timeout: twentyTimeouts().action });
    await this.page.getByText("Add view", { exact: true }).click();
    const nameBox = this.page.getByRole("textbox");
    await nameBox.fill(viewName);
    await this.page.getByRole("button", { name: "Table", exact: true }).click();
    await this.page.getByRole("button", { name: "Calendar", exact: true }).click();
    await this.page.getByRole("button", { name: "Creation date", exact: true }).click();
    await this.page
      .getByRole("dialog", { name: "Date field" })
      .getByRole("button", { name: "Close date", exact: true })
      .click();
    await this.page.getByRole("button", { name: "Create new view" }).click();
    await expect(this.page).toHaveURL(/viewId=/);
    const viewId = new URL(this.page.url()).searchParams.get("viewId");
    if (viewId === null || viewId.trim() === "") {
      throw new Error("Calendar view URL missing viewId");
    }
    await expect(this.nextPeriod).toBeVisible();
    return viewId;
  }

  // Adjacent-month days reuse the number; the cell is the nearest same-column label above the card.
  async expectRecordOnDay(exactName: string, dayNumber: number): Promise<void> {
    const card = this.recordCard(exactName);
    await expect(card).toBeVisible();
    await card.scrollIntoViewIfNeeded();
    const cardBox = await card.boundingBox();
    if (cardBox === null) {
      throw new Error(`calendar card ${exactName} has no box`);
    }
    const labels = await this.dayNumber(dayNumber).all();
    if (labels.length === 0) {
      throw new Error(`calendar day ${String(dayNumber)} not found`);
    }
    let nearestAbove: number | undefined;
    for (const label of labels) {
      const dayBox = await label.boundingBox();
      if (dayBox === null) {
        continue;
      }
      const sameColumn =
        cardBox.x + cardBox.width > dayBox.x && dayBox.x + dayBox.width > cardBox.x;
      if (!sameColumn || cardBox.y < dayBox.y) {
        continue;
      }
      const gap = cardBox.y - dayBox.y;
      if (nearestAbove === undefined || gap < nearestAbove) {
        nearestAbove = gap;
      }
    }
    if (nearestAbove === undefined) {
      throw new Error(
        `calendar card ${exactName} is not in a day cell numbered ${String(dayNumber)} (card=${JSON.stringify(cardBox)})`,
      );
    }
  }
}
