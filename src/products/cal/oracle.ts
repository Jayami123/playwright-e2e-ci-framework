import { expect, type Page } from "@playwright/test";
import { normalizeSlotLabel, toBookingSuccessWhenLine } from "../../core/timezone.js";
import { SLOT_STEP_MINUTES } from "./schedules.js";
import { readBookingStartUtc } from "./db.js";
import { timeouts } from "./env.js";
import { BookingSuccessPage } from "./pages/booking-success.page.js";
import { CAL_ROUTES } from "./routes.js";

export interface BookingOracle {
  readonly uid: string;
  readonly dbStartUtc: Date;
  readonly displayedStartLabel: string;
}

const BOOKING_CANCEL_REASON = "qa-e2e-teardown";

function readCsrfToken(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || !("csrfToken" in payload)) {
    throw new Error("CSRF response JSON did not include csrfToken");
  }
  const token = payload.csrfToken;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("CSRF csrfToken must be a non-empty string");
  }
  return token;
}

export async function readBookingOracle(
  page: Page,
  uid: string,
  viewerTimeZone: string,
  expectedInstant: Date,
): Promise<BookingOracle> {
  const success = new BookingSuccessPage(page);
  if (!page.url().includes(`/booking/${uid}`)) {
    await success.gotoUid(uid);
  } else {
    await success.expectLoaded();
  }
  const displayedStartLabel = await success.expectDisplayedStart(viewerTimeZone, expectedInstant);
  const dbStartUtc = await readBookingStartUtc(uid);
  const expectedIso = expectedInstant.toISOString();
  expect(dbStartUtc.toISOString()).toBe(expectedIso);
  const whenLine = toBookingSuccessWhenLine(expectedInstant, SLOT_STEP_MINUTES, viewerTimeZone);
  const expectedStart = normalizeSlotLabel(whenLine.split(" - ")[0] ?? whenLine);
  expect(displayedStartLabel).toBe(expectedStart);
  return { uid, dbStartUtc, displayedStartLabel };
}

export function expectClickedSlotMatchesInstant(
  clickedDataTime: string,
  expectedInstant: Date,
): void {
  expect(new Date(clickedDataTime).toISOString()).toBe(expectedInstant.toISOString());
}

export async function cancelBookingByUid(page: Page, uid: string): Promise<void> {
  const csrfResponse = await page.request.get(CAL_ROUTES.cancelCsrf, { timeout: timeouts().csrf });
  if (!csrfResponse.ok()) {
    throw new Error(`GET ${CAL_ROUTES.cancelCsrf} failed (HTTP ${String(csrfResponse.status())})`);
  }
  const csrfToken = readCsrfToken(await csrfResponse.json());
  const cancelResponse = await page.request.post(CAL_ROUTES.cancelBooking, {
    data: { uid, csrfToken, cancellationReason: BOOKING_CANCEL_REASON },
    timeout: timeouts().page,
  });
  if (!cancelResponse.ok()) {
    const body = await cancelResponse.text();
    throw new Error(
      `POST ${CAL_ROUTES.cancelBooking} failed (HTTP ${String(cancelResponse.status())}): ${body}`,
    );
  }
}
