import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { CalAppShell } from "../app-shell.js";
import { timeouts } from "../env.js";
import { DEFAULT_EVENT_DURATION_MINUTES, eventSlugFromTitle } from "../factories.js";
import { CAL_ROUTES, isEventTypeEditorPath } from "../routes.js";
import { CAL_TEST_IDS } from "../testIds.js";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class EventTypesPage extends BasePage {
  private readonly shell: CalAppShell;
  readonly heading: Locator;
  readonly newEventType: Locator;
  readonly titleField: Locator;
  readonly durationField: Locator;
  readonly continueButton: Locator;

  constructor(page: Page) {
    super(page);
    this.shell = new CalAppShell(page);
    this.heading = page.getByRole("heading", { name: /event types/i });
    this.newEventType = page.getByTestId(CAL_TEST_IDS.newEventType);
    this.titleField = page.getByTestId(CAL_TEST_IDS.eventTypeQuickChat);
    this.durationField = page.getByLabel(/duration/i);
    this.continueButton = page.getByRole("button", { name: /continue/i });
  }

  async goto(): Promise<void> {
    await this.gotoPath(CAL_ROUTES.eventTypes);
    await this.shell.waitUntilReady();
    await expect(this.heading).toBeVisible({ timeout: timeouts().page });
    await expect(this.newEventType).toBeVisible({ timeout: timeouts().page });
    await this.waitForListHydrated();
  }

  eventTypeLink(title: string): Locator {
    return this.page.getByRole("link", { name: new RegExp(`^${escapeRegExp(title)}`) });
  }

  private listEventLinks(): Locator {
    return this.page.getByRole("main").locator(`a[href*="${CAL_ROUTES.eventTypes}/"]`);
  }

  private async waitForListHydrated(): Promise<void> {
    await expect(this.listEventLinks()).not.toHaveCount(0, { timeout: timeouts().page });
  }

  async create(title: string, lengthMinutes = DEFAULT_EVENT_DURATION_MINUTES): Promise<void> {
    await this.shell.waitUntilReady();
    await this.newEventType.click();
    await expect(this.titleField).toBeVisible({ timeout: timeouts().page });
    await this.titleField.fill(title);
    await expect(this.titleField).toHaveValue(title);
    await this.durationField.fill(String(lengthMinutes));
    const created = this.page.waitForResponse(
      (response) =>
        response.url().includes(CAL_ROUTES.eventTypesHeavyCreate) &&
        response.request().method() === "POST" &&
        response.ok(),
      { timeout: timeouts().page },
    );
    await this.continueButton.click();
    await created;
    await this.page.waitForURL((url) => isEventTypeEditorPath(url.pathname), {
      waitUntil: "domcontentloaded",
      timeout: timeouts().page,
    });
  }

  async expectAvailabilitySchedule(scheduleName: string): Promise<void> {
    const editor = new URL(this.page.url());
    await this.gotoPath(`${editor.pathname}?tabName=availability`);
    const sunday = this.page.getByRole("listitem").filter({ hasText: /sunday/i });
    const combo = this.page.getByRole("main").getByRole("combobox");
    await expect(this.page.getByRole("link", { name: /edit availability/i })).toBeVisible({
      timeout: timeouts().page,
    });
    if ((await sunday.count()) === 0) {
      await combo.focus();
      await this.page.keyboard.press("Enter");
      const option = this.page.getByRole("option", {
        name: new RegExp(escapeRegExp(scheduleName)),
      });
      await expect(option).toBeVisible({ timeout: timeouts().page });
      await option.click();
      const save = this.page.getByTestId(CAL_TEST_IDS.updateEventType);
      await expect(save).toBeEnabled({ timeout: timeouts().page });
      const saved = this.page.waitForResponse(
        (response) =>
          response.url().includes(CAL_ROUTES.eventTypesHeavyUpdate) &&
          response.request().method() === "POST" &&
          response.ok(),
        { timeout: timeouts().page },
      );
      await save.click();
      await saved;
    }
    await expect(sunday).toBeVisible({ timeout: timeouts().page });
  }

  async createdSlug(title: string): Promise<string> {
    const slugField = this.page.getByRole("textbox", { name: /url|slug/i });
    if ((await slugField.count()) > 0) {
      const value = await slugField.inputValue();
      if (value.trim() !== "") {
        return value.trim();
      }
    }
    return eventSlugFromTitle(title);
  }

  async expectListed(title: string): Promise<void> {
    await this.goto();
    await expect(this.eventTypeLink(title)).toBeVisible({ timeout: timeouts().page });
  }

  async deleteByTitle(
    title: string,
    options?: { readonly tolerateMissing?: boolean },
  ): Promise<void> {
    await this.goto();
    const link = this.eventTypeLink(title);
    if (options?.tolerateMissing === true && (await link.count()) === 0) {
      return;
    }
    await expect(link, `Event type "${title}" not found for delete`).toBeVisible({
      timeout: timeouts().page,
    });
    const href = await link.getAttribute("href");
    const id = href?.match(/\/event-types\/(\d+)/)?.[1];
    if (id === undefined) {
      throw new Error(`Could not parse event type id from href: ${href ?? "null"}`);
    }
    const row = this.page.getByRole("listitem").filter({ has: link });
    await row.getByTestId(CAL_TEST_IDS.eventTypeOptions(id)).filter({ visible: true }).click();
    await this.page.getByRole("menuitem", { name: /delete/i }).click();
    await this.page.getByRole("dialog").getByTestId(CAL_TEST_IDS.dialogConfirmation).click();
    await expect(this.eventTypeLink(title)).toHaveCount(0);
  }
}
