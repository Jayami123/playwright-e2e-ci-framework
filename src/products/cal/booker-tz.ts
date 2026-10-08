import { expect, type TestInfo } from "@playwright/test";
import {
  civilDateFromInstant,
  civilDateToIso,
  expectedSlotLabelsForViewerDay,
  fromZonedCivil,
  monthParam,
  nextWeekdayAfter,
  normalizeSlotLabel,
  parseClockToMinutes,
  toZonedLabel,
  type CivilDate,
} from "../../core/timezone.js";
import { required } from "../../core/required.js";
import {
  availabilityWindowsFromOrganiser,
  earliestBookableInstant,
  firstViewerWeekdayWithoutBookings,
  readEventTypeBookingRules,
  type OrganiserAvailability,
} from "./db.js";
import {
  BOOKING_DATE_WINDOW_BASE_DAYS,
  MIN_LEAD_DAYS,
  SLOT_STEP_MINUTES,
  WEEKDAY_SEARCH_ATTEMPTS,
} from "./schedules.js";
import type { BookerPage, SlotView } from "./pages/booker.page.js";

export interface OpenViewerDaySlots {
  readonly date: CivilDate;
  readonly expectedLabels: readonly string[];
  readonly slots: readonly SlotView[];
  readonly first: SlotView;
}

export function availabilityStartCivil(organiser: OrganiserAvailability): {
  readonly hour: number;
  readonly minute: number;
} {
  const firstRow = required(organiser.rows[0], "organiser has no availability rows");
  const minutes = parseClockToMinutes(firstRow.startClock);
  return { hour: Math.floor(minutes / 60), minute: minutes % 60 };
}

export function expectUniformSpacing(slots: readonly SlotView[], stepMs: number): void {
  const isos = slots.map((slot) => Date.parse(slot.iso));
  for (let index = 1; index < isos.length; index += 1) {
    const previous = required(isos[index - 1], "previous slot ISO missing");
    const current = required(isos[index], "slot ISO missing");
    expect(current - previous, "consecutive slot spacing").toBe(stepMs);
  }
}

export function bookingMinLeadDays(testInfo: TestInfo): number {
  const projectOffset = testInfo.project.name
    .split("")
    .reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return BOOKING_DATE_WINDOW_BASE_DAYS + testInfo.parallelIndex * 7 + (projectOffset % 7);
}

async function buildExpectedLabelsForViewerDay(options: {
  readonly organiser: OrganiserAvailability;
  readonly viewerTimeZone: string;
  readonly viewerDate: CivilDate;
  readonly username: string;
  readonly eventSlug: string;
}): Promise<readonly string[]> {
  const rules = await readEventTypeBookingRules(options.username, options.eventSlug);
  const notBefore = earliestBookableInstant(rules.minimumBookingNoticeMinutes);
  return expectedSlotLabelsForViewerDay({
    organiserTimeZone: options.organiser.timeZone,
    viewerTimeZone: options.viewerTimeZone,
    viewerDate: options.viewerDate,
    windows: availabilityWindowsFromOrganiser(options.organiser),
    stepMinutes: SLOT_STEP_MINUTES,
    notBefore,
  });
}

async function openViewerDay(options: {
  readonly booker: BookerPage;
  readonly organiser: OrganiserAvailability;
  readonly viewerTimeZone: string;
  readonly user: string;
  readonly event: string;
  readonly viewerDate: CivilDate;
}): Promise<OpenViewerDaySlots> {
  await options.booker.gotoUserEvent(options.user, options.event, {
    month: monthParam(options.viewerDate),
    date: civilDateToIso(options.viewerDate),
  });
  await options.booker.expectLoaded();
  const slots = await options.booker.readSlots();
  const expectedLabels = await buildExpectedLabelsForViewerDay({
    organiser: options.organiser,
    viewerTimeZone: options.viewerTimeZone,
    viewerDate: options.viewerDate,
    username: options.user,
    eventSlug: options.event,
  });
  const actualLabels = slots.map((slot) => normalizeSlotLabel(slot.label));
  expect(actualLabels).toEqual(expectedLabels);
  const first = required(slots[0], "Booker rendered no slots on the chosen viewer date");
  return { date: options.viewerDate, expectedLabels, slots, first };
}

export async function openFirstAvailabilitySlot(options: {
  readonly booker: BookerPage;
  readonly organiser: OrganiserAvailability;
  readonly viewerTimeZone: string;
  readonly user: string;
  readonly event: string;
}): Promise<OpenViewerDaySlots & { readonly expectedLabel: string }> {
  const viewerDate = await firstViewerWeekdayWithoutBookings({
    organiserEmail: options.organiser.email,
    viewerTimeZone: options.viewerTimeZone,
    minLeadDays: MIN_LEAD_DAYS,
    maxAttempts: WEEKDAY_SEARCH_ATTEMPTS,
  });
  const opened = await openViewerDay({ ...options, viewerDate });
  return {
    ...opened,
    expectedLabel: required(opened.expectedLabels[0], "expected label list was empty"),
  };
}

export async function openBookingAvailabilitySlot(options: {
  readonly booker: BookerPage;
  readonly organiser: OrganiserAvailability;
  readonly viewerTimeZone: string;
  readonly user: string;
  readonly event: string;
  readonly testInfo: TestInfo;
}): Promise<OpenViewerDaySlots & { readonly expectedLabel: string }> {
  const viewerDate = await firstViewerWeekdayWithoutBookings({
    organiserEmail: options.organiser.email,
    viewerTimeZone: options.viewerTimeZone,
    minLeadDays: bookingMinLeadDays(options.testInfo),
    maxAttempts: WEEKDAY_SEARCH_ATTEMPTS,
  });
  const opened = await openViewerDay({ ...options, viewerDate });
  return {
    ...opened,
    expectedLabel: required(opened.expectedLabels[0], "expected label list was empty"),
  };
}

export async function openWeekdaySlots(options: {
  readonly booker: BookerPage;
  readonly organiser: OrganiserAvailability;
  readonly viewerTimeZone: string;
  readonly user: string;
  readonly event: string;
}): Promise<OpenViewerDaySlots & { readonly expectedLabel: string }> {
  const today = civilDateFromInstant(new Date(), options.viewerTimeZone);
  const viewerDate = nextWeekdayAfter(today, options.organiser.timeZone, true);
  const opened = await openViewerDay({ ...options, viewerDate });
  const start = availabilityStartCivil(options.organiser);
  const expectedLabel = toZonedLabel(
    fromZonedCivil(options.organiser.timeZone, { ...viewerDate, ...start }),
    options.viewerTimeZone,
  );
  return { ...opened, expectedLabel };
}

export function expectedInstantIso(instant: Date): string {
  return instant.toISOString();
}
