import { expect, type TestInfo } from "@playwright/test";
import {
  civilDateFromInstant,
  civilDateToIso,
  compareCivilDate,
  expectedSlotEntriesForViewerDay,
  monthParam,
  normalizeSlotLabel,
  type CivilDate,
  type ViewerDaySlotEntry,
} from "../../core/timezone.js";
import { required } from "../../core/required.js";
import {
  availabilityWindowsFromOrganiser,
  earliestBookableInstant,
  firstViewerWeekdayWithoutBusyTime,
  readEventTypeBookingRules,
  type OrganiserAvailability,
} from "./db.js";
import {
  BOOKING_DATE_WINDOW_BASE_DAYS,
  BOOKING_WINDOW_OFFSET_BY_PROJECT,
  MIN_LEAD_DAYS,
  SLOT_STEP_MINUTES,
  WEEKDAY_SEARCH_ATTEMPTS,
} from "./schedules.js";
import type { BookerPage, SlotView } from "./pages/booker.page.js";

export interface OpenViewerDaySlots {
  readonly date: CivilDate;
  readonly expectedLabels: readonly string[];
  readonly expectedEntries: readonly ViewerDaySlotEntry[];
  readonly slots: readonly SlotView[];
  readonly first: SlotView;
  readonly expectedFirstInstant: Date;
}

export function expectUniformSpacing(slots: readonly SlotView[], stepMs: number): void {
  const isos = slots.map((slot) => Date.parse(slot.iso));
  for (let index = 1; index < isos.length; index += 1) {
    const previous = required(isos[index - 1], "previous slot ISO missing");
    const current = required(isos[index], "slot ISO missing");
    expect(current - previous, "consecutive slot spacing").toBe(stepMs);
  }
}

export function expectUniformSpacingWithinOrganiserDays(options: {
  readonly slots: readonly SlotView[];
  readonly expectedEntries: readonly ViewerDaySlotEntry[];
  readonly organiserTimeZone: string;
  readonly stepMs: number;
}): void {
  if (options.expectedEntries.length === 0) {
    return;
  }
  let groupStart = 0;
  for (let index = 1; index <= options.expectedEntries.length; index += 1) {
    const atEnd = index === options.expectedEntries.length;
    const boundary =
      atEnd ||
      compareCivilDate(
        civilDateFromInstant(
          required(options.expectedEntries[index], "next expected entry").instant,
          options.organiserTimeZone,
        ),
        civilDateFromInstant(
          required(options.expectedEntries[index - 1], "prior expected entry").instant,
          options.organiserTimeZone,
        ),
      ) !== 0;
    if (boundary) {
      expectUniformSpacing(options.slots.slice(groupStart, index), options.stepMs);
      groupStart = index;
    }
  }
}

export function bookingWindowOffsetDays(testInfo: TestInfo): number {
  const projectOffset = BOOKING_WINDOW_OFFSET_BY_PROJECT[testInfo.project.name] ?? 0;
  return BOOKING_DATE_WINDOW_BASE_DAYS + testInfo.parallelIndex * 7 + projectOffset;
}

async function buildExpectedEntriesForViewerDay(options: {
  readonly organiser: OrganiserAvailability;
  readonly viewerTimeZone: string;
  readonly viewerDate: CivilDate;
  readonly username: string;
  readonly eventSlug: string;
}): Promise<readonly ViewerDaySlotEntry[]> {
  const rules = await readEventTypeBookingRules(options.username, options.eventSlug);
  const notBefore = earliestBookableInstant(rules.minimumBookingNoticeMinutes);
  return expectedSlotEntriesForViewerDay({
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
  const expectedEntries = await buildExpectedEntriesForViewerDay({
    organiser: options.organiser,
    viewerTimeZone: options.viewerTimeZone,
    viewerDate: options.viewerDate,
    username: options.user,
    eventSlug: options.event,
  });
  const expectedLabels = expectedEntries.map((entry) => entry.label);
  const first = required(slots[0], "Booker rendered no slots on the chosen viewer date");
  const expectedFirstInstant = required(
    expectedEntries[0],
    "Intl oracle produced no slots for the chosen viewer date",
  ).instant;
  return {
    date: options.viewerDate,
    expectedLabels,
    expectedEntries,
    slots,
    first,
    expectedFirstInstant,
  };
}

export async function openFirstAvailabilitySlot(options: {
  readonly booker: BookerPage;
  readonly organiser: OrganiserAvailability;
  readonly viewerTimeZone: string;
  readonly user: string;
  readonly event: string;
}): Promise<OpenViewerDaySlots> {
  const viewerDate = await firstViewerWeekdayWithoutBusyTime({
    organiserEmail: options.organiser.email,
    viewerTimeZone: options.viewerTimeZone,
    minLeadDays: MIN_LEAD_DAYS,
    maxAttempts: WEEKDAY_SEARCH_ATTEMPTS,
  });
  return openViewerDay({ ...options, viewerDate });
}

export async function openBookingAvailabilitySlot(options: {
  readonly booker: BookerPage;
  readonly organiser: OrganiserAvailability;
  readonly viewerTimeZone: string;
  readonly user: string;
  readonly event: string;
  readonly testInfo: TestInfo;
}): Promise<OpenViewerDaySlots> {
  const viewerDate = await firstViewerWeekdayWithoutBusyTime({
    organiserEmail: options.organiser.email,
    viewerTimeZone: options.viewerTimeZone,
    minLeadDays: bookingWindowOffsetDays(options.testInfo),
    maxAttempts: WEEKDAY_SEARCH_ATTEMPTS,
  });
  return openViewerDay({ ...options, viewerDate });
}

export async function openWeekdaySlots(options: {
  readonly booker: BookerPage;
  readonly organiser: OrganiserAvailability;
  readonly viewerTimeZone: string;
  readonly user: string;
  readonly event: string;
}): Promise<OpenViewerDaySlots> {
  const viewerDate = await firstViewerWeekdayWithoutBusyTime({
    organiserEmail: options.organiser.email,
    viewerTimeZone: options.viewerTimeZone,
    minLeadDays: MIN_LEAD_DAYS,
    maxAttempts: WEEKDAY_SEARCH_ATTEMPTS,
  });
  return openViewerDay({ ...options, viewerDate });
}

export function actualSlotLabels(slots: readonly SlotView[]): readonly string[] {
  return slots.map((slot) => normalizeSlotLabel(slot.label));
}

export function expectSlotLabelsMatch(
  actual: readonly string[],
  expected: readonly string[],
): void {
  expect(actual).toEqual(expected);
}
