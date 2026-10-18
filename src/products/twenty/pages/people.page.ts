import { expect, type Locator, type Page, type Response } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { TWENTY_ROUTES, twentyTimeouts } from "../env.js";
import { waitForLiveSubscription } from "./live-subscription.js";
import { TwentyObjectFilterPage } from "./object-filter.page.js";

export class TwentyPeoplePage extends BasePage {
  readonly filterButton: Locator;
  private readonly filter: TwentyObjectFilterPage;

  constructor(page: Page) {
    super(page);
    // eslint-disable-next-line playwright/no-nth-methods -- the view bar and the open filter dropdown both render a Filter button; the first is the view bar one
    this.filterButton = page.getByRole("button", { name: "Filter", exact: true }).first();
    this.filter = new TwentyObjectFilterPage(page);
  }

  rows(): Locator {
    return this.page.getByTestId(/^row-id-/);
  }

  /** The view header button, e.g. "All People · 100". */
  viewCount(): Locator {
    return this.page.getByRole("button", { name: /^All People/ });
  }

  /** Opens a saved view without the English-only Filter button wait, so it works under any locale. */
  async gotoView(viewId: string): Promise<void> {
    await this.gotoPath(`${TWENTY_ROUTES.people}?viewId=${viewId}`);
  }

  rowById(id: string): Locator {
    return this.page.getByTestId(`row-id-${id}`);
  }

  /** The list query filtered by `namePrefix`; register before filterNameContains(). */
  liveSubscription(namePrefix: string): Promise<Response> {
    return waitForLiveSubscription(this.page, "record-table-virtualized-person", namePrefix);
  }

  rowsNamed(prefix: string): Locator {
    return this.rows().filter({ hasText: prefix });
  }

  errorToast(): Locator {
    return this.page.getByRole("status").filter({ hasText: "An error occurred." });
  }

  emptyState(): Locator {
    return this.page.getByText("No Person found");
  }

  async goto(): Promise<void> {
    await this.gotoPath(TWENTY_ROUTES.people);
    await expect(this.filterButton).toBeVisible({ timeout: twentyTimeouts().page });
  }

  /**
   * Step 0: Filter -> "Search fields" "Name" -> Enter -> placeholder "Name" -> value -> Enter, then the
   * portal needs two Escapes. The dropdown occasionally stays covered, so each attempt is bounded and
   * retried once after closing the portals.
   */
  async filterNameContains(value: string): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.filter.filterButton.click({ timeout: 10_000 });
        const fieldSearch = this.page.getByRole("textbox", { name: "Search fields" });
        await fieldSearch.fill("Name", { timeout: 10_000 });
        await fieldSearch.press("Enter");
        await this.page.getByPlaceholder("Name").fill(value, { timeout: 10_000 });
        await this.page.keyboard.press("Enter");
        await this.filter.closeFloatingPortals();
        return;
      } catch (error) {
        if (attempt >= 2) throw error;
        await this.filter.closeFloatingPortals();
      }
    }
  }
}
