import { expect } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { CAL_ROUTES } from "../routes.js";

export class BookingsPage extends BasePage {
  async gotoUpcoming(): Promise<void> {
    await this.gotoPath(CAL_ROUTES.bookingsUpcoming);
  }

  async expectAuthenticatedUpcoming(): Promise<void> {
    await expect(this.page).not.toHaveURL(/\/auth\/login/);
    await expect(this.page).toHaveURL(/\/bookings\/upcoming/);
  }

  async expectLoginRedirect(): Promise<void> {
    await expect(this.page).toHaveURL(/\/auth\/login/);
  }
}
