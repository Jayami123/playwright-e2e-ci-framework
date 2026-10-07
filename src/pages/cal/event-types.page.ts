import { expect, type Page } from "@playwright/test";
import { CalBasePage } from "./base.page.js";

export class EventTypesPage extends CalBasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.installTimezoneHandler();
    await this.gotoPath("/event-types");
    await this.dismissTimezonePrompt();
    await expect(this.page.getByRole("heading", { name: /event types/i })).toBeVisible();
    await expect(this.page.getByTestId("new-event-type")).toBeVisible();
  }

  async create(title: string, lengthMinutes = 10): Promise<void> {
    await this.installTimezoneHandler();
    await this.dismissTimezonePrompt();
    await this.page.getByTestId("new-event-type").click();
    await expect(this.page.getByTestId("event-type-quick-chat")).toBeVisible();
    await this.page.getByTestId("event-type-quick-chat").fill(title);
    const duration = this.page.getByLabel(/duration/i);
    await duration.fill("");
    await duration.fill(String(lengthMinutes));
    const created = this.page.waitForResponse(
      (response) =>
        response.url().includes("eventTypesHeavy/create") &&
        response.request().method() === "POST" &&
        response.ok(),
      { timeout: 180_000 },
    );
    await this.page.getByRole("button", { name: /continue/i }).click();
    await created;
    await this.page.waitForURL((url) => /\/event-types\/\d+/.test(url.pathname), {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
  }

  eventTypeLink(title: string) {
    return this.page.locator('a[href*="/event-types/"]').filter({ hasText: title }).first();
  }

  async expectListed(title: string): Promise<void> {
    await this.goto();
    await expect(this.eventTypeLink(title)).toBeVisible();
  }

  async deleteByTitle(title: string): Promise<void> {
    await this.goto();
    const link = this.eventTypeLink(title);
    if ((await link.count()) === 0) {
      return;
    }
    const href = await link.getAttribute("href");
    const id = href?.match(/\/event-types\/(\d+)/)?.[1];
    if (!id) {
      throw new Error(`Could not parse event type id from href: ${href}`);
    }
    await this.page.getByTestId(`event-type-options-${id}`).first().click();
    await this.page.getByRole("menuitem", { name: /delete/i }).click();
    await this.page.getByTestId("dialog-confirmation").last().click();
    await expect(this.eventTypeLink(title)).toHaveCount(0);
  }
}
