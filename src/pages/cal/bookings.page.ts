import { expect, type Page } from "@playwright/test";
import { CalBasePage } from "./base.page.js";

export class BookingsPage extends CalBasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoUpcoming(): Promise<void> {
    await this.gotoPath("/bookings/upcoming");
  }

  async expectAuthenticatedUpcoming(): Promise<void> {
    await expect(this.page).not.toHaveURL(/\/auth\/login/);
    await expect(this.page).toHaveURL(/\/bookings\/upcoming/);
  }

  async expectLoginRedirect(): Promise<void> {
    await expect(this.page).toHaveURL(/\/auth\/login/);
  }
}
