import type { Page } from "@playwright/test";

/** ADR 0017: far-future Monday; server slot filtering uses real time, so this must stay in the future. */
export const VISUAL_FROZEN_INSTANT = "2030-01-14T10:00:00.000Z";

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

export function parseFrozenInstant(isoDate: string, now: number = Date.now()): Date {
  if (!ISO_UTC.test(isoDate)) {
    throw new Error(
      `freezeClock expects a UTC ISO instant like ${VISUAL_FROZEN_INSTANT}, got "${isoDate}"`,
    );
  }
  const at = new Date(isoDate);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 19) !== isoDate.slice(0, 19)) {
    throw new Error(`freezeClock got an impossible calendar date "${isoDate}"`);
  }
  if (at.getTime() <= now) {
    throw new Error(
      `freezeClock instant ${isoDate} is not in the future; Cal hides past slots using server time (ADR 0017)`,
    );
  }
  return at;
}

/** Call before the first page.goto so the booker's initial month and selected day use the frozen date. */
export async function freezeClock(page: Page, isoDate: string): Promise<void> {
  await page.clock.setFixedTime(parseFrozenInstant(isoDate));
}
