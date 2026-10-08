import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { CalAppShell } from "../app-shell.js";
import { timeouts } from "../env.js";
import { CAL_ROUTES } from "../routes.js";
import { CAL_TEST_IDS } from "../testIds.js";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DAY_HOUR_COMBOBOXES = 2;

const NEXT_WEEKDAY: Readonly<Record<string, string>> = {
  sunday: "Monday",
  monday: "Tuesday",
  tuesday: "Wednesday",
  wednesday: "Thursday",
  thursday: "Friday",
  friday: "Saturday",
  saturday: "Sunday",
};

export class AvailabilityPage extends BasePage {
  private readonly shell: CalAppShell;
  readonly heading: Locator;
  readonly newSchedule: Locator;

  constructor(page: Page) {
    super(page);
    this.shell = new CalAppShell(page);
    this.heading = page.getByRole("heading", { name: /availability/i });
    this.newSchedule = page.getByTestId(CAL_TEST_IDS.newSchedule).filter({ visible: true });
  }

  async goto(): Promise<void> {
    await this.gotoPath(CAL_ROUTES.availability);
    await this.shell.waitUntilReady();
    await expect(this.heading).toBeVisible({ timeout: timeouts().page });
  }

  scheduleRow(name: string): Locator {
    return this.page.getByTestId(CAL_TEST_IDS.schedules).getByText(new RegExp(escapeRegExp(name)));
  }

  async createNamedSchedule(name: string): Promise<void> {
    await this.goto();
    await this.newSchedule.click();
    const dialog = this.page.getByRole("dialog").filter({
      has: this.page.getByRole("heading", { name: /add a new schedule/i }),
    });
    await expect(dialog).toBeVisible({ timeout: timeouts().page });
    const nameField = dialog.getByRole("textbox");
    await expect(nameField).toBeVisible({ timeout: timeouts().page });
    await nameField.fill(name);
    await dialog.getByRole("button", { name: /continue/i }).click();
    await expect(this.page.getByTestId(CAL_TEST_IDS.availabilityTitle)).toHaveValue(name, {
      timeout: timeouts().page,
    });
  }

  async setTimezone(iana: string): Promise<void> {
    const trigger = this.page.getByRole("combobox", { name: /timezone select/i });
    await expect(trigger).toBeVisible({ timeout: timeouts().page });
    await trigger.click();
    await trigger.fill(iana.replace(/_/g, " "));
    const option = this.page
      .getByTestId(CAL_TEST_IDS.timezoneSelectOption(iana))
      .or(this.page.getByRole("option", { name: new RegExp(iana.replace(/_/g, "[_ ]"), "i") }));
    await expect(option).toBeVisible({ timeout: timeouts().page });
    await option.click();
  }

  daySwitch(dayName: string): Locator {
    return this.page.getByRole("switch", { name: new RegExp(`^${escapeRegExp(dayName)}$`, "i") });
  }

  dayHours(dayName: string): Locator {
    const next = NEXT_WEEKDAY[dayName.toLowerCase()];
    if (next === undefined) {
      throw new Error(`Unknown weekday: ${dayName}`);
    }
    return this.page
      .locator("div")
      .filter({ has: this.daySwitch(dayName) })
      .filter({ has: this.page.getByRole("combobox") })
      .filter({ hasNot: this.daySwitch(next) });
  }

  async enableDay(dayName: string): Promise<void> {
    const toggle = this.daySwitch(dayName);
    await expect(toggle).toBeVisible({ timeout: timeouts().page });
    if ((await toggle.getAttribute("aria-checked")) !== "true") {
      await toggle.click();
    }
  }

  async setDayHours(dayName: string, startLabel: string, endLabel: string): Promise<void> {
    const hours = this.dayHours(dayName);
    await expect(hours.getByRole("combobox")).toHaveCount(DAY_HOUR_COMBOBOXES, {
      timeout: timeouts().page,
    });
    await hours
      .getByText(/9:00\s*am/i)
      .locator("..")
      .click();
    await this.page
      .getByRole("option", { name: new RegExp(`^${escapeRegExp(startLabel)}$`, "i") })
      .click();
    await hours
      .getByText(/5:00\s*pm/i)
      .locator("..")
      .click();
    await this.page
      .getByRole("option", { name: new RegExp(`^${escapeRegExp(endLabel)}$`, "i") })
      .click();
  }

  async setAsDefault(): Promise<void> {
    const toggle = this.page
      .locator("div")
      .filter({ hasText: /^set as default$/i })
      .getByRole("switch");
    await expect(toggle).toBeVisible({ timeout: timeouts().page });
    if ((await toggle.getAttribute("aria-checked")) === "true") {
      return;
    }
    await toggle.click();
    const update = this.page.getByRole("button", { name: /^update$/i });
    await expect(update).toBeVisible({ timeout: timeouts().page });
    await update.click();
    await expect(update).toHaveCount(0, { timeout: timeouts().page });
  }

  async save(): Promise<void> {
    const saveButton = this.page.getByRole("button", { name: /^save$/i });
    await expect(saveButton).toBeVisible({ timeout: timeouts().page });
    if (!(await saveButton.isEnabled())) {
      return;
    }
    const saved = this.page.waitForResponse(
      (response) =>
        response.url().includes(CAL_ROUTES.scheduleUpdate) &&
        response.request().method() === "POST" &&
        response.ok(),
      { timeout: timeouts().page },
    );
    await saveButton.click();
    await saved;
  }

  async openByName(name: string): Promise<void> {
    await this.goto();
    await this.scheduleRow(name).click();
    await expect(this.page.getByTestId(CAL_TEST_IDS.availabilityTitle)).toHaveValue(name, {
      timeout: timeouts().page,
    });
  }

  async promoteDefault(name: string): Promise<void> {
    await this.openByName(name);
    await this.setAsDefault();
    await this.save();
  }

  async deleteByName(
    name: string,
    options?: { readonly tolerateMissing?: boolean; readonly tolerateDefault?: boolean },
  ): Promise<void> {
    await this.goto();
    const rowText = this.scheduleRow(name);
    if (options?.tolerateMissing === true && (await rowText.count()) === 0) {
      return;
    }
    const item = this.page.getByRole("listitem").filter({ has: rowText });
    const more = item.getByTestId(CAL_TEST_IDS.scheduleMore).filter({ visible: true });
    if (options?.tolerateDefault === true && (await more.count()) === 0) {
      return;
    }
    await more.click();
    await this.page.getByTestId(CAL_TEST_IDS.deleteSchedule).click();
    await this.page.getByRole("dialog").getByTestId(CAL_TEST_IDS.dialogConfirmation).click();
    await expect(this.scheduleRow(name)).toHaveCount(0);
  }
}
