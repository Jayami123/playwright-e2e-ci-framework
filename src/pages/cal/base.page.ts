import { expect, type Page } from "@playwright/test";
import { calBaseUrl } from "../../env.js";

const timezoneHandlerPages = new WeakSet<Page>();
const WEBPACK_WAIT_MS = 180_000;

export class CalBasePage {
  constructor(protected readonly page: Page) {}

  protected url(pathname: string): string {
    return `${calBaseUrl()}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  }

  /** Next webpack HMR / issue overlay often prevents the `load` event. */
  protected async gotoPath(pathname: string): Promise<void> {
    await this.page.goto(this.url(pathname), { waitUntil: "domcontentloaded" });
    await this.dismissNextIssueOverlay();
    await this.dismissTimezonePrompt();
  }

  /** Dev overlay intercepts clicks; Escape closes the Next.js issue toast. */
  protected async dismissNextIssueOverlay(): Promise<void> {
    const overlay = this.page.locator("nextjs-portal");
    if ((await overlay.count()) === 0) return;
    await this.page.keyboard.press("Escape").catch(() => undefined);
  }

  /** Cal timezone mismatch dialog hides the rest of the page from the a11y tree. */
  protected async installTimezoneHandler(): Promise<void> {
    if (timezoneHandlerPages.has(this.page)) return;
    timezoneHandlerPages.add(this.page);
    await this.page.addLocatorHandler(this.page.getByRole("button", { name: /don'?t update/i }), async (button) => {
      await button.click();
    });
  }

  protected async dismissTimezonePrompt(): Promise<void> {
    await this.installTimezoneHandler();
    const dontUpdate = this.page.getByRole("button", { name: /don'?t update/i });
    if (await dontUpdate.isVisible().catch(() => false)) {
      await dontUpdate.click();
    }
  }

  /**
   * Org switcher shows "Loading..." until the shell hydrates.
   * A stuck spinner after the webpack wait is usually next-dev compiling or a memory restart.
   */
  protected async waitForShellReady(): Promise<void> {
    await this.dismissTimezonePrompt();
    await this.dismissNextIssueOverlay();
    const loading = this.page.getByRole("button", { name: /Loading/i });
    await expect(loading, "Cal sidebar still shows Loading... after webpack wait").toHaveCount(0, {
      timeout: WEBPACK_WAIT_MS,
    });
  }
}
