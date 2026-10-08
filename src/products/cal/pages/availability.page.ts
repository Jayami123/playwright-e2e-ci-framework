import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { escapeRegExp } from "../../../core/regex.js";
import { normalizeSlotLabel } from "../../../core/timezone.js";
import { CalAppShell } from "../app-shell.js";
import { timeouts } from "../env.js";
import { CAL_ROUTES } from "../routes.js";
import { CAL_TEST_IDS } from "../testIds.js";
import {
  CLOCK_FIVE_PM_LABEL,
  CLOCK_NINE_AM_LABEL,
  WORKING_HOURS_SCHEDULE_NAME,
} from "../schedules.js";

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
    return this.page.getByTestId(CAL_TEST_IDS.schedules).getByText(name, { exact: true });
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
    return this.page.getByTestId(`${dayName}-switch`);
  }

  dayRow(dayName: string): Locator {
    return this.page.getByTestId(dayName);
  }

  private dayHourCombobox(dayName: string, selectedLabel: string): Locator {
    const normalized = normalizeSlotLabel(selectedLabel);
    return this.dayRow(dayName).getByRole("combobox", {
      name: new RegExp(`^${escapeRegExp(normalized)}$`, "i"),
    });
  }

  private async chooseComboboxOption(combo: Locator, optionLabel: string): Promise<void> {
    const normalized = normalizeSlotLabel(optionLabel);
    await expect(combo).toBeVisible({ timeout: timeouts().page });
    await combo.click();
    await this.page
      .getByRole("option", {
        name: new RegExp(`^${escapeRegExp(normalized)}$`, "i"),
      })
      .click();
  }

  async enableDay(dayName: string): Promise<void> {
    const toggle = this.daySwitch(dayName);
    await expect(toggle).toBeVisible({ timeout: timeouts().page });
    if (await toggle.isChecked()) {
      return;
    }
    await toggle.click();
    await expect(toggle).toBeChecked({ timeout: timeouts().page });
  }

  async setDayHours(dayName: string, startLabel: string, endLabel: string): Promise<void> {
    await this.enableDay(dayName);
    const normalizedStart = normalizeSlotLabel(startLabel);
    const normalizedEnd = normalizeSlotLabel(endLabel);
    const defaultStart = normalizeSlotLabel(CLOCK_NINE_AM_LABEL);
    const defaultEnd = normalizeSlotLabel(CLOCK_FIVE_PM_LABEL);
    if (normalizedStart !== defaultStart) {
      await this.chooseComboboxOption(
        this.dayHourCombobox(dayName, CLOCK_NINE_AM_LABEL),
        startLabel,
      );
    }
    if (normalizedEnd !== defaultEnd) {
      await this.chooseComboboxOption(this.dayHourCombobox(dayName, CLOCK_FIVE_PM_LABEL), endLabel);
    }
  }

  async setAsDefault(): Promise<void> {
    const toggle = this.page.getByRole("switch", { name: /set as default/i });
    await expect(toggle).toBeVisible({ timeout: timeouts().page });
    if (await toggle.isChecked()) {
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
    const toggle = this.page.getByRole("switch", { name: /set as default/i });
    await expect(toggle).toBeVisible({ timeout: timeouts().page });
    if (await toggle.isChecked()) {
      return;
    }
    await this.setAsDefault();
    await this.save();
  }

  async deleteByName(
    name: string,
    options?: { readonly tolerateMissing?: boolean },
  ): Promise<void> {
    await this.goto();
    const rowText = this.scheduleRow(name);
    if (options?.tolerateMissing === true && !(await rowText.isVisible())) {
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
    const names = (
      await this.page
        .getByTestId(CAL_TEST_IDS.schedules)
        .getByText(/^sch-qa-/)
        .allInnerTexts()
    ).map((name) => name.trim());
    for (const name of names) {
      await this.deleteByName(name, { tolerateMissing: true });
    }
  }
}
