import type { Page } from "@playwright/test";

export class BasePage {
  constructor(protected readonly page: Page) {}

  protected async gotoPath(pathname: string): Promise<void> {
    await this.page.goto(pathname, { waitUntil: "domcontentloaded" });
  }
}
