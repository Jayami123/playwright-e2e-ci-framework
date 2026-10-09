import type { Page } from "@playwright/test";
import {
  readEventTypeIdByTitle,
  readScheduleIdByName,
  teardownIsolatedSundayEventInDb,
  type IsolatedSundayTeardownIds,
} from "./db.js";
import { loadConfig } from "./env.js";
import { THIRTY_MINUTE_DURATION } from "./factories.js";
import type { AvailabilityPage } from "./pages/availability.page.js";
import type { EventTypesPage } from "./pages/event-types.page.js";
import {
  CLOCK_FIVE_PM_LABEL,
  CLOCK_MIDNIGHT_LABEL,
  CLOCK_NINE_AM_LABEL,
  SUNDAY_DAY_NAME,
} from "./schedules.js";

export interface IsolatedSundayEvent {
  readonly title: string;
  readonly slug: string;
  readonly scheduleName: string;
  readonly scheduleId: number;
  readonly eventTypeId: number;
}

export interface SundayProvisionOptions {
  readonly scheduleTimeZone: string;
  readonly overnight: boolean;
  readonly title: string;
  readonly scheduleName: string;
}

export interface SundayOrganiser {
  readonly eventTypes: EventTypesPage;
  readonly availability: AvailabilityPage;
  readonly page: Page;
}

export async function provisionIsolatedSundayEvent(
  organiser: SundayOrganiser,
  options: SundayProvisionOptions,
): Promise<IsolatedSundayEvent> {
  const { title, scheduleName } = options;
  await organiser.availability.createNamedSchedule(scheduleName);
  await organiser.availability.setTimezone(options.scheduleTimeZone);
  await organiser.availability.enableDay(SUNDAY_DAY_NAME);
  await organiser.availability.setDayHours(
    SUNDAY_DAY_NAME,
    options.overnight ? CLOCK_MIDNIGHT_LABEL : CLOCK_NINE_AM_LABEL,
    CLOCK_FIVE_PM_LABEL,
  );
  await organiser.availability.save();
  await organiser.eventTypes.goto();
  await organiser.eventTypes.create(title, THIRTY_MINUTE_DURATION);
  const slug = await organiser.eventTypes.createdSlug();
  await organiser.eventTypes.assignAvailabilitySchedule(scheduleName);
  await organiser.eventTypes.expectSundayAvailabilityRow();
  const { dstEmail } = loadConfig();
  const scheduleId = await readScheduleIdByName(dstEmail, scheduleName);
  const eventTypeId = await readEventTypeIdByTitle(dstEmail, title);
  return { title, slug, scheduleName, scheduleId, eventTypeId };
}

export async function teardownIsolatedSundayEvent(options: {
  readonly organiser: SundayOrganiser;
  readonly provisioned: IsolatedSundayEvent;
  readonly bookingUid?: string;
  readonly cancelBooking: (page: Page, uid: string) => Promise<void>;
}): Promise<void> {
  const failures: unknown[] = [];
  if (options.bookingUid !== undefined) {
    try {
      await options.cancelBooking(options.organiser.page, options.bookingUid);
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    const { dstEmail } = loadConfig();
    const ids: IsolatedSundayTeardownIds = {
      email: dstEmail,
      scheduleId: options.provisioned.scheduleId,
      eventTypeId: options.provisioned.eventTypeId,
    };
    await teardownIsolatedSundayEventInDb(ids);
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Isolated Sunday event teardown failed");
  }
}
