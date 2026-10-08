import { expect, type Page } from "@playwright/test";
import { calWaitMs } from "../../env.js";
import { CalBasePage } from "./base.page.js";

export class EventTypesPage extends CalBasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.installTimezoneHandler();
    await this.gotoPath("/event-types");
    await this.waitForShellReady();
    await expect(this.page.getByRole("heading", { name: /event types/i })).toBeVisible({
      timeout: calWaitMs(),
    });
    await expect(this.page.getByTestId("new-event-type")).toBeVisible({ timeout: calWaitMs() });
  }

  async create(title: string, lengthMinutes = 10): Promise<void> {
    await this.installTimezoneHandler();
    await this.waitForShellReady();
    await this.page.getByTestId("new-event-type").click({ noWaitAfter: true });
    await this.dismissTimezonePrompt();
    const titleField = this.page.getByTestId("event-type-quick-chat");
    await expect(titleField).toBeVisible({ timeout: calWaitMs() });
    await titleField.fill(title);
    await expect(titleField).toHaveValue(title);
    const duration = this.page.getByLabel(/duration/i);
    await duration.fill("");
    await duration.fill(String(lengthMinutes));
    const created = this.page.waitForResponse(
      (response) =>
        response.url().includes("eventTypesHeavy/create") &&
        response.request().method() === "POST" &&
        response.ok(),
      { timeout: calWaitMs() },
    );
    await this.dismissTimezonePrompt();
    await this.page.getByRole("button", { name: /continue/i }).click();
    await this.dismissTimezonePrompt();
    await created;
    await this.page.waitForURL((url) => /\/event-types\/\d+/.test(url.pathname), {
      waitUntil: "domcontentloaded",
      timeout: calWaitMs(),
    });
  }

  eventTypeLink(title: string) {
    return this.page.getByRole("link", { name: title }).first();
  }

  async expectListed(title: string): Promise<void> {
    await this.goto();
    await expect(this.eventTypeLink(title)).toBeVisible({ timeout: calWaitMs() });
  }

  async deleteByTitle(title: string): Promise<void> {
    await this.goto();
    const link = this.eventTypeLink(title);
    await expect(link, `Event type "${title}" not found for delete`).toBeVisible({
      timeout: calWaitMs(),
    });
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
