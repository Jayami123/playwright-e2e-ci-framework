import { expect, type Locator, type Page } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { escapeRegExp } from "../../../core/regex.js";
import { normalizeSlotLabel } from "../../../core/timezone.js";
import { CalAppShell } from "../app-shell.js";
import { timeouts } from "../env.js";
import { CAL_ROUTES } from "../routes.js";
import { CAL_TEST_IDS } from "../testIds.js";
import { readScheduleEditorPathByName } from "../db.js";

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
    await this.waitForScheduleListLoaded();
  }

  private async waitForScheduleListLoaded(): Promise<void> {
    const schedules = this.page.getByTestId(CAL_TEST_IDS.schedules);
    await expect(schedules).toBeVisible({ timeout: timeouts().page });
    await expect(schedules.getByRole("listitem")).not.toHaveCount(0, {
      timeout: timeouts().page,
    });
  }

  scheduleRow(name: string): Locator {
    return this.scheduleLink(name);
  }

  private scheduleLink(name: string): Locator {
    return this.scheduleListItem(name).getByRole("link", {
      name: new RegExp(`^${escapeRegExp(name)}$`),
    });
  }

  private scheduleListItem(name: string): Locator {
    return this.page
      .getByTestId(CAL_TEST_IDS.schedules)
      .getByRole("listitem")
      .filter({
        has: this.page.getByRole("link", { name: new RegExp(`^${escapeRegExp(name)}$`) }),
      });
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

  private hourRangeRow(dayName: string): Locator {
    return this.dayRow(dayName).filter({ hasText: / - / });
  }

  private startHourCombobox(dayName: string): Locator {
    // Cal LazySelect pair in one flex row; inputs have no accessible name (verified on harness UI).
    // eslint-disable-next-line playwright/no-nth-methods -- start is always the first combobox in the range row
    return this.hourRangeRow(dayName).getByRole("combobox").nth(0);
  }

  private endHourCombobox(dayName: string): Locator {
    // eslint-disable-next-line playwright/no-nth-methods -- end is always the second combobox in the range row
    return this.hourRangeRow(dayName).getByRole("combobox").nth(1);
  }

  private async selectDayHourOption(
    dayName: string,
    slot: "start" | "end",
    hourLabel: string,
  ): Promise<void> {
    const normalized = normalizeSlotLabel(hourLabel);
    const combo =
      slot === "start" ? this.startHourCombobox(dayName) : this.endHourCombobox(dayName);
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
    await toggle.setChecked(true);
    await expect(toggle).toBeChecked({ timeout: timeouts().page });
    await expect(this.dayRow(dayName).getByRole("combobox")).toHaveCount(2, {
      timeout: timeouts().page,
    });
  }

  async setDayHours(dayName: string, startLabel: string, endLabel: string): Promise<void> {
    await this.enableDay(dayName);
    await this.selectDayHourOption(dayName, "start", startLabel);
    await this.selectDayHourOption(dayName, "end", endLabel);
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

  async openByName(name: string, options?: { readonly ownerEmail?: string }): Promise<void> {
    if (options?.ownerEmail !== undefined) {
      await this.gotoPath(await readScheduleEditorPathByName(options.ownerEmail, name));
      await this.shell.waitUntilReady();
    } else {
      await this.goto();
      await this.scheduleRow(name).click();
    }
    await expect(this.page.getByTestId(CAL_TEST_IDS.availabilityTitle)).toHaveValue(name, {
      timeout: timeouts().page,
    });
  }

  async deleteByName(
    name: string,
    options?: { readonly tolerateMissing?: boolean },
  ): Promise<void> {
    await this.goto();
    const item = this.scheduleListItem(name);
    if (options?.tolerateMissing === true) {
      if ((await item.count()) === 0) {
        return;
      }
    }
    const more = item.getByTestId(CAL_TEST_IDS.scheduleMore).filter({ visible: true });
    await expect(more, `Schedule "${name}" has no delete menu (still default?)`).toBeVisible({
      timeout: timeouts().page,
    });
    await more.click();
    await this.page.getByTestId(CAL_TEST_IDS.deleteSchedule).click();
    await this.page.getByRole("dialog").getByTestId(CAL_TEST_IDS.dialogConfirmation).click();
    await expect(this.scheduleListItem(name)).toHaveCount(0);
  }
}
