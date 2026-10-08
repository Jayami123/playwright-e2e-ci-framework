import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { escapeRegExp } from "../../../core/regex.js";
import { CalAppShell } from "../app-shell.js";
import { timeouts } from "../env.js";
import { CAL_ROUTES } from "../routes.js";
import { CAL_TEST_IDS } from "../testIds.js";
import { WORKING_HOURS_SCHEDULE_NAME } from "../schedules.js";

const DAY_HOUR_COMBOBOXES = 2;

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

  dayRow(dayName: string): Locator {
    return this.page.getByRole("listitem").filter({ has: this.daySwitch(dayName) });
  }

  async enableDay(dayName: string): Promise<void> {
    const toggle = this.daySwitch(dayName);
    await expect(toggle).toBeVisible({ timeout: timeouts().page });
    if ((await toggle.getAttribute("aria-checked")) !== "true") {
      await toggle.click();
    }
  }

  async setDayHours(dayName: string, startLabel: string, endLabel: string): Promise<void> {
    const row = this.dayRow(dayName);
    const combos = row.getByRole("combobox");
    await expect(combos).toHaveCount(DAY_HOUR_COMBOBOXES, { timeout: timeouts().page });
    await combos.nth(0).click();
    await this.page
      .getByRole("option", { name: new RegExp(`^${escapeRegExp(startLabel)}$`, "i") })
      .click();
    await combos.nth(1).click();
    await this.page
      .getByRole("option", { name: new RegExp(`^${escapeRegExp(endLabel)}$`, "i") })
      .click();
  }

  async setAsDefault(): Promise<void> {
    const toggle = this.page.getByRole("switch", { name: /set as default/i });
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
    await expect(saveButton, "Save stayed disabled after schedule edits").toBeEnabled({
      timeout: timeouts().page,
    });
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

  async promoteWorkingHoursDefault(): Promise<void> {
    await this.openByName(WORKING_HOURS_SCHEDULE_NAME);
    await this.setAsDefault();
    await this.save();
  }

  async deleteByName(
    name: string,
    options?: { readonly tolerateMissing?: boolean },
  ): Promise<void> {
    await this.goto();
    const rowText = this.scheduleRow(name);
    if (options?.tolerateMissing === true && (await rowText.count()) === 0) {
      return;
    }
    const item = this.page.getByRole("listitem").filter({ has: rowText });
    const more = item.getByTestId(CAL_TEST_IDS.scheduleMore).filter({ visible: true });
    await expect(more, `Schedule "${name}" has no delete menu (still default?)`).toBeVisible({
      timeout: timeouts().page,
    });
    await more.click();
    await this.page.getByTestId(CAL_TEST_IDS.deleteSchedule).click();
    await this.page.getByRole("dialog").getByTestId(CAL_TEST_IDS.dialogConfirmation).click();
    await expect(this.scheduleRow(name)).toHaveCount(0);
  }

  async deleteQaSchedules(): Promise<void> {
    await this.goto();
    const rows = this.page.getByTestId(CAL_TEST_IDS.schedules).getByText(/^sch-qa-/);
    const count = await rows.count();
    for (let index = 0; index < count; index += 1) {
      const name = (await rows.nth(0).innerText()).trim();
      await this.deleteByName(name, { tolerateMissing: true });
    }
  }
}
