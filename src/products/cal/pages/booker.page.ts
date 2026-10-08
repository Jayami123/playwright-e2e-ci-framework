import { expect, type Locator, type Page, type Response } from "@playwright/test";
import { BasePage } from "../../../core/base.page.js";
import { timeouts } from "../env.js";
import { CAL_ROUTES, PRO_THIRTY_MIN_SLUG } from "../routes.js";
import { CAL_TEST_IDS } from "../testIds.js";

export interface BookerQuery {
  readonly month?: string;
  readonly date?: string;
}

export interface SlotView {
  readonly label: string;
  readonly iso: string;
}

interface SlotDom {
  getAttribute(name: string): string | null;
  textContent: string | null;
}

export class BookingRejectedError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, context: string) {
    super(`Booking POST HTTP ${String(status)}: ${body}; ${context}`);
    this.name = "BookingRejectedError";
    this.status = status;
    this.body = body;
  }
}

function bookerPath(user: string, event: string, query?: BookerQuery): string {
  const path = CAL_ROUTES.publicBooker(user, event);
  const params = new URLSearchParams();
  if (query?.month !== undefined) {
    params.set("month", query.month);
  }
  if (query?.date !== undefined) {
    params.set("date", query.date);
  }
  const encoded = params.toString();
  return encoded === "" ? path : `${path}?${encoded}`;
}

export class BookerPage extends BasePage {
  readonly container: Locator;
  readonly timezoneSelect: Locator;
  readonly nameField: Locator;
  readonly emailField: Locator;
  readonly confirmButton: Locator;

  constructor(page: Page) {
    super(page);
    this.container = page.getByTestId(CAL_TEST_IDS.bookerContainer);
    this.timezoneSelect = page.getByRole("combobox", { name: /timezone select/i });
    this.nameField = page.getByRole("textbox", { name: /your name/i });
    this.emailField = page.getByRole("textbox", { name: /email address/i });
    this.confirmButton = page.getByTestId(CAL_TEST_IDS.confirmBook);
  }

  slotButtons(): Locator {
    return this.page.getByTestId(CAL_TEST_IDS.timeSlot);
  }

  async gotoUserEvent(user: string, event: string, query?: BookerQuery): Promise<void> {
    await this.gotoPath(bookerPath(user, event, query));
  }

  async gotoProThirtyMin(query?: BookerQuery): Promise<void> {
    await this.gotoUserEvent(PRO_THIRTY_MIN_SLUG.user, PRO_THIRTY_MIN_SLUG.event, query);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.container).toBeVisible({ timeout: timeouts().page });
  }

  async reload(): Promise<void> {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await this.expectLoaded();
  }

  async readSlots(): Promise<readonly SlotView[]> {
    await expect(this.slotButtons()).not.toHaveCount(0, { timeout: timeouts().page });
    const slots = await this.slotButtons().evaluateAll((elements: readonly SlotDom[]) =>
      elements.map((element, index) => {
        const iso = element.getAttribute("data-time");
        if (iso === null || iso.trim() === "") {
          throw new Error(`Slot button at index ${String(index)} is missing data-time`);
        }
        return {
          label: (element.textContent ?? "").trim(),
          iso,
        };
      }),
    );
    return slots;
  }

  async backToSlots(): Promise<void> {
    const back = this.page.getByTestId(CAL_TEST_IDS.bookerBack);
    await expect(back).toBeVisible({ timeout: timeouts().page });
    await back.click();
    await expect(this.slotButtons()).not.toHaveCount(0, { timeout: timeouts().page });
  }

  async selectSlotByIso(iso: string): Promise<void> {
    const wantedMs = Date.parse(iso);
    if (Number.isNaN(wantedMs)) {
      throw new Error(`Invalid slot instant: ${iso}`);
    }
    const attribute = await this.slotButtons().evaluateAll(
      (elements: readonly SlotDom[], ms: number) => {
        const match = elements.find(
          (element) => Date.parse(element.getAttribute("data-time") ?? "") === ms,
        );
        return match?.getAttribute("data-time") ?? null;
      },
      wantedMs,
    );
    if (attribute === null) {
      throw new Error(`No slot button with instant ${iso}`);
    }
    // ADR 0006: duplicate fall-back labels; data-time is the only unique key (dynamic template; see no-raw-locators).
    const byInstant = this.page.locator(`[data-time="${attribute}"]`);
    const slot = this.slotButtons().and(byInstant);
    await expect(slot).toHaveCount(1);
    await slot.click();
  }

  async selectTimezone(iana: string): Promise<void> {
    await expect(this.timezoneSelect).toBeVisible({ timeout: timeouts().page });
    await this.timezoneSelect.click();
    const search = this.page.getByRole("textbox", { name: /timezone select/i });
    await search.fill(iana.replace(/_/g, " "));
    await this.page.getByTestId(CAL_TEST_IDS.timezoneSelectOption(iana)).click();
  }

  async book(attendee: { readonly name: string; readonly email: string }): Promise<string> {
    await expect(this.nameField).toBeVisible({ timeout: timeouts().page });
    await this.nameField.fill(attendee.name);
    await this.emailField.fill(attendee.email);
    await expect(this.confirmButton).toBeEnabled({ timeout: timeouts().page });
    const posted = this.page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().includes("/api/book/event"),
      { timeout: timeouts().editor },
    );
    await this.confirmButton.click();
    let response: Response;
    try {
      response = await posted;
    } catch (error) {
      throw new Error(await this.bookingSubmitContext("No POST /api/book/event"), { cause: error });
    }
    if (!response.ok()) {
      const body = await response.text();
      throw new BookingRejectedError(
        response.status(),
        body,
        await this.bookingSubmitContext(`Booking POST HTTP ${String(response.status())}: ${body}`),
      );
    }
    await this.page.waitForURL((url) => url.pathname.startsWith("/booking/"), {
      waitUntil: "domcontentloaded",
      timeout: timeouts().editor,
    });
    const match = /\/booking\/([^/?#]+)/.exec(this.page.url());
    const uid = match?.[1];
    if (uid === undefined || uid.length === 0) {
      throw new Error(`Success URL has no booking uid: ${this.page.url()}`);
    }
    return uid;
  }

  private async bookingSubmitContext(prefix: string): Promise<string> {
    const fail = this.page.getByTestId(CAL_TEST_IDS.bookingFail);
    const failVisible = await fail.isVisible().catch(() => false);
    const failText = failVisible ? (await fail.innerText()).trim() : "";
    const confirmText = (await this.confirmButton.innerText().catch(() => "")).trim();
    return `${prefix}; confirm="${confirmText}"; bookingFail=${failText || "absent"}; url=${this.page.url()}`;
  }
}
