import { expect, type Page } from "@playwright/test";
import { timeouts } from "./env.js";

const TIMEZONE_DISMISS = /don'?t update/i;

export async function installTimezoneHandler(page: Page): Promise<void> {
  await page.addLocatorHandler(
    page.getByRole("button", { name: TIMEZONE_DISMISS }),
    async (button) => {
      await button.click();
    },
  );
}

export class CalAppShell {
  constructor(private readonly page: Page) {}

  async dismissNextIssueOverlay(): Promise<void> {
    // eslint-disable-next-line playwright/no-raw-locators -- ADR 0006: Next.js dev overlay has no semantic roles
    const overlay = this.page
      .locator("nextjs-portal")
      .locator("[data-nextjs-dialog], [data-nextjs-dialog-overlay]");
    const visible = await overlay.isVisible().catch(() => false);
    if (!visible) {
      return;
    }
    await this.page.keyboard.press("Escape").catch(() => undefined);
  }

  async waitUntilReady(): Promise<void> {
    await this.dismissNextIssueOverlay();
    await expect(this.page.getByRole("link", { name: /^event types$/i })).toBeVisible({
      timeout: timeouts().page,
    });
    await expect(this.page.getByRole("button", { name: /avatar/i })).toBeEnabled({
      timeout: timeouts().page,
    });
  }
}
